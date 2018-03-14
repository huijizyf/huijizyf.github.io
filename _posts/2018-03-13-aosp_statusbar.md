---
layout: post
title: AOSP中导航栏与状态栏的处理
category: 安卓
tag: [安卓,源码,aosp,statusbar,navigationbar]
---
###AOSP中导航栏与状态栏的解析

**概念**
---
StatusBar是我们看见的屏幕上方显示时间，信号等信息的部分。

NavigationBar是手机下方的虚拟导航条部分，主要是为没有实体按键的设备提供虚拟按键

这部分代码位于framework/base/packages/SystemUI中


**代码结构**

以下基于aosp 7.1源码

StatusBar
![](/images/aosp/statusbar.png)

NavigationBar
![](/images/aosp/navigationbar.png)

我们在手机上看见的PhoneStatusBar是继承自BaseStatusBar的，BaseStatusBar还有另外一个子类TvStatusBar，我们看下这个类的源码发现里面的方法体都是空的，也就是说这个类其实什么都没有做，当我们使用这个类的时候，在屏幕上就没有StatuBar与NavigationBar，如果我们想要去除StatuBar与NavigationBar只需要在device下相应的设备目录内的overlay/frameworks/base/packages/SystemUI/res/values/config.xml内配置config_statusBarComponent为TvStatusBar如下


	<string name="config_statusBarComponent" translatable="false">com.android.systemui.statusbar.tv.TvStatusBar</string>


在PhoneStatusBar源码中有以下方法：

	    protected void addNavigationBar() {
        if (DEBUG) Log.v(TAG, "addNavigationBar: about to add " + mNavigationBarView);
        if (mNavigationBarView == null) return;

        try {
            WindowManagerGlobal.getWindowManagerService()
                    .watchRotation(new IRotationWatcher.Stub() {
                @Override
                public void onRotationChanged(int rotation) throws RemoteException {
                    // We need this to be scheduled as early as possible to beat the redrawing of
                    // window in response to the orientation change.
                    Message msg = Message.obtain(mHandler, () -> {
                        if (mNavigationBarView != null
                                && mNavigationBarView.needsReorient(rotation)) {
                            repositionNavigationBar();
                        }
                    });
                    msg.setAsynchronous(true);
                    mHandler.sendMessageAtFrontOfQueue(msg);
                }
            });
        } catch (RemoteException e) {
            throw e.rethrowFromSystemServer();
        }

        prepareNavigationBarView();

        mWindowManager.addView(mNavigationBarView, getNavigationBarLayoutParams());
    }

addNavigationBar会在PhoneStatusBar的start方法中被调用，但是在addNavigationBar被调用之前我们看见了调用了super.start(),在PhoneStatusBar的父类也即BaseStatusBar的start方法中调用了createAndAddWindows，而在BaseStatusBar中createAndAddWindows是一个抽象方法，所以实际调用了PhoneStatusBar的createAndAddWindows，在createAndAddWindows中又调用了addStatusBarWindow，接着在addStatusBarWindow中调用了makeStatusBarView，在这里会对StatusBar做一系列的处理，再根据实际情况决定需不需要显示NavigationBar，在makeStatusBarView中有以下代码
	
	try {
            boolean showNav = mWindowManagerService.hasNavigationBar();
            if (DEBUG) Log.v(TAG, "hasNavigationBar=" + showNav);
            if (showNav) {
                createNavigationBarView(context);
            }
        } catch (RemoteException ex) {
            // no window manager? good luck with that
        }

也就是说会根据mWindowManagerService.hasNavigationBar()的结果决定是否创建NavigationBar，这里最终调用到了PhoneWindowManager的hasNavigationBar方法，而在PhoneWindowManager的setInitialDisplaySize方法中有以下内容：
	
	mHasNavigationBar = res.getBoolean(com.android.internal.R.bool.config_showNavigationBar);

        // Allow a system property to override this. Used by the emulator.
        // See also hasNavigationBar().
        String navBarOverride = SystemProperties.get("qemu.hw.mainkeys");
        if ("1".equals(navBarOverride)) {
            mHasNavigationBar = false;
        } else if ("0".equals(navBarOverride)) {
            mHasNavigationBar = true;
        }
所以实际上决定是否显示NavigationBar由R.bool.config_showNavigationBar与qemu.hw.mainkeys共同决定。qemu.hw.mainkeys可在build.prop中指定，而R.bool.config_showNavigationBar定义在frameworks/base/core/res/res/values/config.xml中，也可以通过device对应目录下的overlay中设定。

PhoneStatusBarView与NavigationBarView的源码均位于framework/ase/packages/SystemUI/src/com/android/systemui/statusbar/phone目录下。
PhoneStatusBarView的继承关系
![](/images/aosp/status_bar_view.png)

NavigationBarView的继承关系
![](/images/aosp/nvbar_view.png)




