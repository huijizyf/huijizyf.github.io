---
layout: post
title: 安卓源码分析（启动过程分析）
category: 安卓
tag: [安卓,lineage,源码,分析]
---

基于Lineage OS 14.1(Android 7.1.2)分析

```
android系统基于Linux内核，启动过程分为三个阶段BootLoader ---> Linux Kernel --->Android

Android的启动过程主要涉及到以下几个步骤：
init，zygote，systemserver，launcher，lockscreen,othersapps
```

<h3>Init进程</h3>

Init进程是Android系统用户空间的第一个进程，Init进程源码位于：system/core/init。从init.cpp文件的main函数开始分析Init进程主要做了以下工作。

<h4>挂载文件系统</h4>
第一阶段挂载基础的文件系统
{% highlight c %}
    // Get the basic filesystem setup we need put together in the initramdisk
    // on / and then we'll let the rc file figure out the rest.
    if (is_first_stage) {
        mount("tmpfs", "/dev", "tmpfs", MS_NOSUID, "mode=0755");
        mkdir("/dev/pts", 0755);
        mkdir("/dev/socket", 0755);
        mount("devpts", "/dev/pts", "devpts", 0, NULL);
        #define MAKE_STR(x) __STRING(x)
        mount("proc", "/proc", "proc", 0, "hidepid=2,gid=" MAKE_STR(AID_READPROC));
        mount("sysfs", "/sys", "sysfs", 0, NULL);
    }
    
    // We must have some place other than / to create the device nodes for
    // kmsg and null, otherwise we won't be able to remount / read-only
    // later on. Now that tmpfs is mounted on /dev, we can actually talk
    // to the outside world.
    open_devnull_stdio();
    klog_init();
    klog_set_level(KLOG_NOTICE_LEVEL);
{% endhighlight %}

<h4>解析property文件并初始化property</h4>
在init的第二阶段中调用了property_init函数，此函数位于property_service.cpp中，可以
看到property_init函数的实现如下
{% highlight c %}
void property_init() {
    if (__system_property_area_init()) {
        ERROR("Failed to initialize property area\n");
        exit(1);
    }
}
{% endhighlight %}

所以我们还需要再找到__system_property_area_init的函数源码，此函数位于bionic/libc/bionic/system_properties.cpp中,在这个文件中我们看到调用关系如下：

{% highlight c %}
__system_property_area_init ---> map_system_property_area ---> map_prop_area_rw

map_prop_area_rw函数的主要内容是利用mmap映射property_filename创建了一个共享内存区域，并将共享内存的首地址赋值给全局变量__system_property_area__,函数代码如下：

static prop_area* map_prop_area_rw(const char* filename, const char* context,
                                   bool* fsetxattr_failed) {
    /* dev is a tmpfs that we can use to carve a shared workspace
     * out of, so let's do that...
     */
    const int fd = open(filename, O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC | O_EXCL, 0444);

    if (fd < 0) {
        if (errno == EACCES) {
            /* for consistency with the case where the process has already
             * mapped the page in and segfaults when trying to write to it
             */
            abort();
        }
        return nullptr;
    }

    if (context) {
        if (fsetxattr(fd, XATTR_NAME_SELINUX, context, strlen(context) + 1, 0) != 0) {
            __libc_format_log(ANDROID_LOG_ERROR, "libc",
                              "fsetxattr failed to set context (%s) for \"%s\"", context, filename);
            /*
             * fsetxattr() will fail during system properties tests due to selinux policy.
             * We do not want to create a custom policy for the tester, so we will continue in
             * this function but set a flag that an error has occurred.
             * Init, which is the only daemon that should ever call this function will abort
             * when this error occurs.
             * Otherwise, the tester will ignore it and continue, albeit without any selinux
             * property separation.
             */
            if (fsetxattr_failed) {
                *fsetxattr_failed = true;
            }
        }
    }

    if (ftruncate(fd, PA_SIZE) < 0) {
        close(fd);
        return nullptr;
    }

    pa_size = PA_SIZE;
    pa_data_size = pa_size - sizeof(prop_area);
    compat_mode = false;

    void *const memory_area = mmap(NULL, pa_size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (memory_area == MAP_FAILED) {
        close(fd);
        return nullptr;
    }

    prop_area *pa = new(memory_area) prop_area(PROP_AREA_MAGIC, PROP_AREA_VERSION);

    close(fd);
    return pa;
}

{% endhighlight %}

<h4>读取init.rc文件，启动服务</h4>
init.rc文件主要包含了四种类型的语句:Action,Commands,Services,Options.

Section: 语句块，相当于c语言中大括号内的一个块。一个Section以Service或On开头的语句块.
以Service开头的Section叫做服务,而以On开头的叫做动作(Action).
services: 服务.
Action: 动作
commands:命令.
options:选项.
trigger:触发器，或者叫做触发条件.
class: 类属，即可以为多个service指定一个相同的类属，方便操作同时启动或停止.

init.cpp中解析init.rc文件的代码如下，主要是读取init.rc文件，然后执行相应的动作

{% highlight c %}

    const BuiltinFunctionMap function_map;
    Action::set_function_map(&function_map);

    Parser& parser = Parser::GetInstance();
    parser.AddSectionParser("service",std::make_unique<ServiceParser>());
    parser.AddSectionParser("on", std::make_unique<ActionParser>());
    parser.AddSectionParser("import", std::make_unique<ImportParser>());
    parser.ParseConfig("/init.rc");

    ActionManager& am = ActionManager::GetInstance();

    am.QueueEventTrigger("early-init");

    // Queue an action that waits for coldboot done so we know ueventd has set up all of /dev...
    am.QueueBuiltinAction(wait_for_coldboot_done_action, "wait_for_coldboot_done");
    // ... so that we can start queuing up actions that require stuff from /dev.
    am.QueueBuiltinAction(mix_hwrng_into_linux_rng_action, "mix_hwrng_into_linux_rng");
    am.QueueBuiltinAction(keychord_init_action, "keychord_init");
    am.QueueBuiltinAction(console_init_action, "console_init");

    // Trigger all the boot actions to get us started.
    am.QueueEventTrigger("init");

    // Repeat mix_hwrng_into_linux_rng in case /dev/hw_random or /dev/random
    // wasn't ready immediately after wait_for_coldboot_done
    am.QueueBuiltinAction(mix_hwrng_into_linux_rng_action, "mix_hwrng_into_linux_rng");

    // Don't mount filesystems or start core system services in charger mode.
    std::string bootmode = property_get("ro.bootmode");
    if (bootmode == "charger" || charging_mode_booting() ||
            strcmp(battchg_pause, BOARD_CHARGING_CMDLINE_VALUE) == 0) {
        am.QueueEventTrigger("charger");
    } else if (strncmp(bootmode.c_str(), "ffbm", 4) == 0) {
        NOTICE("Booting into ffbm mode\n");
        am.QueueEventTrigger("ffbm");
    } else {
        am.QueueEventTrigger("late-init");
    }

    // Run all property triggers based on current state of the properties.
    am.QueueBuiltinAction(queue_property_triggers_action, "queue_property_triggers");

    while (true) {
        if (!waiting_for_exec) {
            am.ExecuteOneCommand();
            restart_processes();
        }

        int timeout = -1;
        if (process_needs_restart) {
            timeout = (process_needs_restart - gettime()) * 1000;
            if (timeout < 0)
                timeout = 0;
        }

        if (am.HasMoreCommands()) {
            timeout = 0;
        }

        bootchart_sample(&timeout);

        epoll_event ev;
        int nr = TEMP_FAILURE_RETRY(epoll_wait(epoll_fd, &ev, 1, timeout));
        if (nr == -1) {
            ERROR("epoll_wait failed: %s\n", strerror(errno));
        } else if (nr == 1) {
            ((void (*)()) ev.data.ptr)();
        }
    }
{% endhighlight %}

下面简单的摘录了部分init.rc的文件内容：
{% highlight c %}
设置环境变量
# setup the global environment
    export PATH /sbin:/vendor/bin:/system/sbin:/system/bin:/system/xbin
    export LD_LIBRARY_PATH /vendor/lib:/system/lib
    export ANDROID_BOOTLOGO 1
    export ANDROID_ROOT /system
    export ANDROID_ASSETS /system/app
    export ANDROID_DATA /data
    export ASEC_MOUNTPOINT /mnt/asec
    export LOOP_MOUNTPOINT /mnt/obb
    export BOOTCLASSPATH /system/framework/core.jar:/system/framework/core-junit.jar:/system/framework/bouncycastle.jar:/system/framework/ext.jar:/system/framework/framework.jar:/system/framework/framework-ext.jar:/system/framework/android.policy.jar:/system/framework/services.jar:/system/framework/apache-xml.jar:/system/framework/com.motorola.frameworks.core.addon.jar:/system/framework/com.motorola.android.widget.jar
   
   创建和挂载文件，并修改文件权限
 on post-fs-data
    # We chown/chmod /data again so because mount is run as root + defaults
    chown system system /data
    chmod 0771 /data

    # Create dump dir and collect dumps.
    # Do this before we mount cache so eventually we can use cache for
    # storing dumps on platforms which do not have a dedicated dump partition.
    mkdir /data/dontpanic 0750 root log

    # Collect apanic data, free resources and re-arm trigger
    copy /proc/apanic_console /data/dontpanic/apanic_console
    chown root log /data/dontpanic/apanic_console
    chmod 0640 /data/dontpanic/apanic_console

    copy /proc/apanic_threads /data/dontpanic/apanic_threads
    chown root log /data/dontpanic/apanic_threads
    chmod 0640 /data/dontpanic/apanic_threads

    # If there is no apanic handle action in the init.<device>.rc file, you
    # must uncomment this line, otherwise apanic proc entry
    # won't be removed.
    # write /proc/apanic_console 1

    # create basic filesystem structure
    mkdir /data/misc 01771 system misc
    mkdir /data/misc/bluetoothd 0770 bluetooth bluetooth
    mkdir /data/misc/bluetooth 0770 system system
    mkdir /data/misc/keystore 0700 keystore keystore
    mkdir /data/misc/keychain 0771 system system
    mkdir /data/misc/vpn 0770 system vpn
    mkdir /data/misc/systemkeys 0700 system system
    # give system access to wpa_supplicant.conf for backup and restore
    mkdir /data/misc/wifi 0770 wifi wifi
    chmod 0660 /data/misc/wifi/wpa_supplicant.conf
    mkdir /data/local 0751 root root

    # For security reasons, /data/local/tmp should always be empty.
    # Do not place files or directories in /data/local/tmp
    mkdir /data/local/tmp 0771 shell shell
    mkdir /data/data 0771 system system
    mkdir /data/app-private 0771 system system
    mkdir /data/app-asec 0700 root root
    mkdir /data/app 0771 system system
    mkdir /data/property 0700 root root
    mkdir /data/ssh 0750 root shell
    mkdir /data/ssh/empty 0700 root root

    # create dalvik-cache, so as to enforce our permissions
    mkdir /data/dalvik-cache 0771 system system

    # create resource-cache and double-check the perms
    mkdir /data/resource-cache 0771 system system
    chown system system /data/resource-cache
    chmod 0771 /data/resource-cache

    # create the lost+found directories, so as to enforce our permissions
    mkdir /data/lost+found 0770 root root

    # create directory for DRM plug-ins - give drm the read/write access to
    # the following directory.
    mkdir /data/drm 0770 drm drm

    # If there is no fs-post-data action in the init.<device>.rc file, you
    # must uncomment this line, otherwise encrypted filesystems
    # won't work.
    # Set indication (checked by vold) that we have finished this action
    #setprop vold.post_fs_data_done 1
    
    设置网络初始化
    on boot
# basic network init
    ifup lo
    hostname localhost
    domainname localdomain
    
    启动孕育进程即zygote
    service zygote /system/bin/app_process -Xzygote /system/bin --zygote --start-system-server
    class main
    socket zygote stream 660 root system
    onrestart write /sys/android_power/request_state wake
    onrestart write /sys/power/state on
    onrestart restart media
    onrestart restart netd
    
    启动多媒体服务
    service media /system/bin/mediaserver
    class main
    user media
    group audio camera inet net_bt net_bt_admin net_bw_acct drmrpc mot_drm input mot_tpapi mot_secclkd mot_pwric mot_caif media
    ioprio rt 4
    allowrtprio

播放开机动画
service bootanim /system/bin/bootanimation
    class main
    user graphics
    group graphics
    disabled
    oneshot
{% endhighlight %}


<h3> zygote进程</h3>
在Init进程解析init.rc文件的时候，我们看到zygote是由init进程启动的，在Zygote进程中会完成java虚拟机的创建及初始化，以及准备了java运行时环境，还有jni的准备工作，zygote和system_server在安卓系统中占据着非常重要的作用
zygote的源码位于frameworks/base/cmds/app_process下，代码中调用AppRuntime创建java运行时环境。
{% highlight c %}
bool zygote = false;
    bool startSystemServer = false;
    bool application = false;
    String8 niceName;
    String8 className;

    ++i;  // Skip unused "parent dir" argument.
    while (i < argc) {
        const char* arg = argv[i++];
        if (strcmp(arg, "--zygote") == 0) {
            zygote = true;
            niceName = ZYGOTE_NICE_NAME;
        } else if (strcmp(arg, "--start-system-server") == 0) {
            startSystemServer = true;
        } else if (strcmp(arg, "--application") == 0) {
            application = true;
        } else if (strncmp(arg, "--nice-name=", 12) == 0) {
            niceName.setTo(arg + 12);
        } else if (strncmp(arg, "--", 2) != 0) {
            className.setTo(arg);
            break;
        } else {
            --i;
            break;
        }
    }

    Vector<String8> args;
    if (!className.isEmpty()) {
        // We're not in zygote mode, the only argument we need to pass
        // to RuntimeInit is the application argument.
        //
        // The Remainder of args get passed to startup class main(). Make
        // copies of them before we overwrite them with the process name.
        args.add(application ? String8("application") : String8("tool"));
        runtime.setClassNameAndArgs(className, argc - i, argv + i);
    } else {
        // We're in zygote mode.
        maybeCreateDalvikCache();

        if (startSystemServer) {
            args.add(String8("start-system-server"));
        }

        char prop[PROP_VALUE_MAX];
        if (property_get(ABI_LIST_PROPERTY, prop, NULL) == 0) {
            LOG_ALWAYS_FATAL("app_process: Unable to determine ABI list from property %s.",
                ABI_LIST_PROPERTY);
            return 11;
        }

        String8 abiFlag("--abi-list=");
        abiFlag.append(prop);
        args.add(abiFlag);

        // In zygote mode, pass all remaining arguments to the zygote
        // main() method.
        for (; i < argc; ++i) {
            args.add(String8(argv[i]));
        }
    }

    if (!niceName.isEmpty()) {
        runtime.setArgv0(niceName.string());
        set_process_name(niceName.string());
    }

    if (zygote) {
        runtime.start("com.android.internal.os.ZygoteInit", args, zygote);
    } else if (className) {
        runtime.start("com.android.internal.os.RuntimeInit", args, zygote);
    } else {
        fprintf(stderr, "Error: no class name or --zygote supplied.\n");
        app_usage();
        LOG_ALWAYS_FATAL("app_process: no class name or --zygote supplied.");
        return 10;
    }
{% endhighlight %}
AppRuntime是AndroidRuntime的子类，AndroidRuntime的源码位于 frameworks\base\core\jni\AndroidRuntime.cpp。在 AndroidRuntime.cpp
源码中我们看见其start方法中有以下语句：
env->CallStaticVoidMethod(startClass, startMeth, strArray);

即我们在app_process.cpp的main方法中其实开启了java类：com.android.internal.os.ZygoteInit

ZygoteInit源码位于：framework/base/core/java/com/android/internal/os/ZygoteInit.java,在ZygoteInit中启动了SystemServer进入了启动的下一阶段

<h3>SystemServer</h3>
SystemServer源码位于
frameworks/base/services/java/com/android/server/SystemServer.java

SystemServer的main方法中创建了SystemServer的示例对象，并运行了其run方法，所以我们重点关注run方法中的内容，run方法主要作用如下
{% highlight java%}
设置系统参数
SystemProperties.set("xxxx", xxxx);

创建系统上下文
createSystemContext();

	启动系统服务
    try {
            Trace.traceBegin(Trace.TRACE_TAG_SYSTEM_SERVER, "StartServices");
            startBootstrapServices();
            startCoreServices();
            startOtherServices();
        } catch (Throwable ex) {
            Slog.e("System", "******************************************");
            Slog.e("System", "************ Failure starting system services", ex);
            throw ex;
        } finally {
            Trace.traceEnd(Trace.TRACE_TAG_SYSTEM_SERVER);
        }
        
 // We now tell the activity manager it is okay to run third party
        // code.  It will call back into us once it has gotten to the state
        // where third party code can really run (but before it has actually
        // started launching the initial applications), for us to complete our
        // initialization.
 mActivityManagerService.systemReady(...);
{% endhighlight %}


<h3>launcher</h3>
系统启动成功后SystemServer使用xxx.systemReady()通知各个服务，系统已经就绪.桌面程序Home就是在ActivityManagerService.systemReady()通知的过程中建立的，最终调用startHomeActivityLocked()启动launcher
ActivityManagerService源码位于：frameworks/base/services/core/java/com/android/server/am/ActivityManagerService.java

ActivityManagerService.java源码中
systemReady调用了：
mStackSupervisor.resumeFocusedStackTopActivityLocked();
mUserController.sendUserSwitchBroadcastsLocked(-1, currentUserId);

frameworks/base/services/core/java/com/android/server/am/ActivityStackSupervisor.java
接下来看ActivityStackSupervisor的源码
{% highlight java %}
    boolean resumeFocusedStackTopActivityLocked(
            ActivityStack targetStack, ActivityRecord target, ActivityOptions targetOptions) {
        if (targetStack != null && isFocusedStack(targetStack)) {
            return targetStack.resumeTopActivityUncheckedLocked(target, targetOptions);
        }
        final ActivityRecord r = mFocusedStack.topRunningActivityLocked();
        if (r == null || r.state != RESUMED) {
            mFocusedStack.resumeTopActivityUncheckedLocked(null, null);
        }
        return false;
    }
{% endhighlight %}

看到在这里调用了mService.startHomeActivityLocked(mCurrentUser, myReason)，再次回到了ActivityManageService中;
{% highlight java %}

 boolean resumeHomeStackTask(int homeStackTaskType, ActivityRecord prev, String reason) {
        if (!mService.mBooting && !mService.mBooted) {
            // Not ready yet!
            return false;
        }

        if (homeStackTaskType == RECENTS_ACTIVITY_TYPE) {
            mWindowManager.showRecentApps(false /* fromHome */);
            return false;
        }

        if (prev != null) {
            prev.task.setTaskToReturnTo(APPLICATION_ACTIVITY_TYPE);
        }

        mHomeStack.moveHomeStackTaskToTop(homeStackTaskType);
        ActivityRecord r = getHomeActivity();
        final String myReason = reason + " resumeHomeStackTask";

        // Only resume home activity if isn't finishing.
        if (r != null && !r.finishing) {
            mService.setFocusedActivityLocked(r, myReason);
            return resumeFocusedStackTopActivityLocked(mHomeStack, prev, null);
        }
        return mService.startHomeActivityLocked(mCurrentUser, myReason);
    }
{% endhighlight %}

在ActivityManageService中启动了Launcher
ProcessRecord app = getProcessRecordLocked(aInfo.processName,
                    aInfo.applicationInfo.uid, true);
            if (app == null || app.instrumentationClass == null) {
                intent.setFlags(intent.getFlags() | Intent.FLAG_ACTIVITY_NEW_TASK);
                mActivityStarter.startHomeActivityLocked(intent, aInfo, reason);
            }




