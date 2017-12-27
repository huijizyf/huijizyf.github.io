---
layout: post
title: 为OrangePi One 编译Android 4.4
category: 安卓
tag: [安卓,源码,orange pi,编译]
---
前两天成功的为Orange pi 编译了USB无线网卡驱动，想起几个月前尝试在Mac下为Orange pi编译Android 4.4，由于环境原因失败了，心有不甘，于是想再重新尝试编译一次，并将无线网卡驱动集成进安卓中。

<h3>步骤</h3>

1.第一步当然还是获取源码了，不过源码不用去谷歌和git上获取，Orangepi已经有打包好的包在百度云了，地址：[Android源码](https://pan.baidu.com/s/1i5qnJud)

2.搭建环境，因为是Android 4.4 我们需要使用jdk1.6，下载地址：[Jdk1.6 for OS X](https://support.apple.com/kb/DL1572?locale=zh_CN)

3.使用jenv管理多版本jdk [使用方法](http://jenv.io/)

4.编译内核，因为Orange pi的内核编译工具链无法在Mac下使用，我们需要在ubuntu下编译内核，过程比较简单，也没有出现问题，步骤省略。

5.将编译出的内核文件复制到安卓源码上层目录名为lichee对应的文件夹中，具体可看device/softwinner/common/vendorsetup.sh脚本，其中有以下内容：
	
	function extract-bsp()
	{
		LICHEE_DIR=$ANDROID_BUILD_TOP/../lichee
	    CHIP_VERSION=$(get_build_var SW_CHIP_PLATFORM)
	    if [ "$CHIP_VERSION" = "H8" ];then
		    LINUXOUT_DIR=$LICHEE_DIR/out/sun8iw6p1/android/common
		elif [ "$CHIP_VERSION" = "H3" ];then
			LINUXOUT_DIR=$LICHEE_DIR/out/sun8iw7p1/android/common
	    elif [ "$CHIP_VERSION" = "A80" ];then
		    LINUXOUT_DIR=$LICHEE_DIR/out/sun9iw1p1/android/common
	    else
	        echo "unknow CHIP_VERSION $CHIP_VERSION"
	        return
	    fi
		LINUXOUT_MODULE_DIR=$LINUXOUT_DIR/lib/modules/*/*
		CURDIR=$PWD

		cd $DEVICE
	
		#extract kernel
		if [ -f kernel ] ; then
			rm kernel
		fi
		cp $LINUXOUT_DIR/bImage kernel
		echo "$DEVICE/bImage copied!"
	
		#extract linux modules
		if [ -d modules ] ; then
			rm -rf modules
		fi
		mkdir -p modules/modules
		cp -rf $LINUXOUT_MODULE_DIR modules/modules
		echo "$DEVICE/modules copied!"
		chmod 0755 modules/modules/*
	
		# create modules.mk
		    (cat << EOF) > ./modules/modules.mk
		# modules.mk generate by extract-files.sh, do not edit it.
		PRODUCT_COPY_FILES += \\
			\$(call find-copy-subdir-files,*,\$(LOCAL_PATH)/modules,system/vendor/modules)
		EOF
		
			cd $CURDIR
	}

5.编写编译脚本(非必须，为了省去每次编译需要手敲几次命令)，脚本放置在源码根目录，命名为build_opi.sh,增加执行权限，脚本内容如下
	
	#!/bin/bash
	source build/envsetup.sh
	lunch dolphin_fvd_p1-eng
	extract-bsp
	export MACOSX_DEPLOYMENT_TARGET=10.8
	make -j4
	
6.执行命令，开始编译

	./build_opi.sh
	
7.遇见错误后，对应下一节的错误解决办法解决后继续编译。

8.还是出现了错误2，进行了各种尝试依旧没有解决，看来还是得在Ubuntu的虚拟机上编译了。

9.在编译成功后，会在下一篇文章中记录添加无线网卡驱动的过程



<h3>错误解决办法</h3>
1.编译过程出现以下错误

	<built-in>:0: error: Unknown value ‘10.11’ of -mmacosx-version-min<built-i

解决办法
	
	从git下载 10.8的SDK，地址：https://github.com/huijizyf/MacOSXSDKs
	将MacOSX10.8.sdk 文件夹放入/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs下
	终端内执行以下命令：
		sudo vi /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/Info.plist
	将：
	<key>MinimumSDKVersion</key>
	<string>10.11</string>
	修改为：
	<key>MinimumSDKVersion</key>
	<string>10.8</string>

2.出现以下错误

	clang: error: unsupported option '--gdwarf2'
	
解决办法：
	
	终端执行以下命令:
		find . -name "*.h" |xargs grep gdwarf2
	发现以下4个文件中有这样的描述：/* Define if your assembler supports the --gdwarf2 option. */
	
	prebuilts/gcc/darwin-x86/arm/arm-eabi-4.6/lib/gcc/arm-eabi/4.6.x-google/plugin/include/auto-host.h
	prebuilts/gcc/darwin-x86/arm/arm-linux-androideabi-4.6/lib/gcc/arm-linux-androideabi/4.6.x-google/plugin/include/auto-host.h
	prebuilts/gcc/linux-x86/arm/arm-eabi-4.6/lib/gcc/arm-eabi/4.6.x-google/plugin/include/auto-host.h
	prebuilts/gcc/linux-x86/arm/arm-linux-androideabi-4.6/lib/gcc/arm-linux-androideabi/4.6.x-google/plugin/include/auto-host.h

	对以上五个文件进行修改

![](/images/complie_driver/gdwarf.png)