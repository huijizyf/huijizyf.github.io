---
layout: post
title: 在Mac上为树莓派编译安卓7.1
category: 安卓
tag: [安卓,7.1,源码,树莓派,编译]
---


<h2>环境</h2>h2>
1.Host：MacBook Air （13 英寸，2015 年初） 

外置128G硬盘 区分大小写

Xcode 7.3

![](/images/rpi/mac_info.png)

2.树莓派：树莓派3B   16GB存储卡    读卡器
![](/images/rpi/rpi.png)


<h2>步骤</h2>h2>
1.下载源码
	
	Refer to http://source.android.com/source/downloading.html
	
	repo init -u https://android.googlesource.com/platform/manifest -b android-7.1.2_r19
	为了避免被墙，加快速度，repo init的步骤可以参考(实测1速度更快)：
	1.https://lug.ustc.edu.cn/wiki/mirrors/help/aosp
	2.https://mirrors.tuna.tsinghua.edu.cn/help/AOSP/
	
	git clone https://github.com/android-rpi/local_manifests .repo/local_manifests
	repo sync
	漫长的等待，源码较大，60G以上,如果repo sync的时候 kernel_rpi external_mesa3d这两项同
	步不下来的话，先在.repo/local_manifests/default.xml中把这两项注释掉，然后执行repo 
	sync，最后在github上下载zip包，解压至源码对应路径。
	
	源码下载完成后，需要对源码做一些简单的修改可参见：
	https://github.com/android-rpi/device_brcm_rpi3/wiki#use-hal_pixel_format_bgra_8888

2.安装gcc-linaro-arm-linux-gnueabihf，下载地址：
	
	http://download.csdn.net/download/u010955001/10148489
	
3.安装gnu-sed
	
	由于mac自带的sed与gnu-sed有区别，编译过程中需要使用到gnu-sed，所以我们要安装gnu-sed。
	你可以选择brew  或者port来安装。
	我选择的是brew：brew install gnu-sed --with-default-names
	安装完成以后：
	sudo rm /usr/local/bin/sed
	sudo ln -s /usr/local/Cellar/gnu-sed/4.4/bin/sed /usr/local/bin/sed
	这样会将mac自带的sed删除，并使用gnu-sed，你也可以保留自带的sed，只需将gnu-sed的路径
	export至系统环境变量前即可。
	
4.编写编译脚本，以下是我已经写好的脚本，将以下内容保存到源码根路径下，命名为build_rpi.sh，然后chmod a+x build_rpi.sh  增加可执行权限。
	
	#!/bin/bash
	if [[ $1 = all ]]; then
		cd kernel/rpi
		ARCH=arm scripts/kconfig/merge_config.sh arch/arm/configs/bcm2709_defconfig android/configs/android-base.cfg android/configs/android-recommended.cfg
		ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- make zImage
		ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- make dtbs
		cd ../..
		source build/envsetup.sh
		lunch rpi3-eng
		make ramdisk systemimage
	fi
	
	if [[ $1 = kernel ]]; then
		cd kernel/rpi
		ARCH=arm scripts/kconfig/merge_config.sh arch/arm/configs/bcm2709_defconfig android/configs/android-base.cfg android/configs/android-recommended.cfg
		ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- make zImage
		ARCH=arm CROSS_COMPILE=arm-linux-gnueabihf- make dtbs
		cd ../..
	fi
	
	if [[ $1 = android ]]; then
		source build/envsetup.sh
		lunch rpi3-eng
		make ramdisk systemimage
	fi

5.有了上一步的脚本后，在源码根路径下执行脚本即可
	
	./build_rpi.sh all     //编译内核和安卓代码
	./build_rpi.sh kernel   //编译内核
	./build_rpi.sh android   //编译安卓
	
6.烧写系统
	
	准备一张8G以上SD，为SD卡创建分区(因为需要创建ext4文件系统最好使用Linux，我使用Mac分区失
	败了，才安装了Ubuntu的虚拟机为SD卡分区),分区结构如下图（注意system分区大小为1G）：
	
![](/images/rpi/sd.png)
	
	p1 512MB for BOOT : Do fdisk : W95 FAT32(LBA) & Bootable, mkfs.vfat
	p2 1024MB for /system : Do fdisk, new primary partition
	p3 512MB for /cache  : Do fdisk, mkfs.ext4
	p4 remainings for /data : Do fdisk, mkfs.ext4
	Set volume label for each partition - system, cache, userdata
	: use -L option of mkfs.ext4, e2label command, or -n option of mkfs.vfat
	
	# Write system partition
  	$ cd out/target/product/rpi3
	$ sudo dd if=system.img of=/dev/<p2> bs=1M
	
	# Copy kernel & ramdisk to BOOT partition
	device/brcm/rpi3/boot/* to p1:/
	kernel/rpi/arch/arm/boot/zImage to p1:/
	kernel/rpi/arch/arm/boot/dts/bcm2710-rpi-3-b.dtb to p1:/
	kernel/rpi/arch/arm/boot/dts/overlays/vc4-kms-v3d.dtbo to p1:/overlays/vc4-kms-v3d.dtbo
	out/target/product/rpi3/ramdisk.img to p1:/
	
7.SD卡插入树莓派，使用USB-TTL连接树莓派的串口和电脑的USB。

8.树莓派开始启动，在minicom中即可进入树莓派终端，也能看到启动消息

###错误
1.scripts/mod/mk_elfconfig.c:4:10: fatal error: 'elf.h' file not found

解决办法
	
	到这个路径 https://www.rockbox.org/tracker/9006?getfile=16683 找到elf.h的源码，
	放在 scripts/mod下，并修改报错部分的include<elf.h>为 include "elf.h" 再次编译，如果
	遇到这个类似的报错，也修改include<elf.h> 即可，注意路径。
	

	
2.编译内核的时候提示needed by `net/netfilter/built-in.o'

解决办法

	因为同步kernel_rpi的时候失败了，所以是下载的zip包解压，实际是解压后复制过来的文件不完整，
	所以，先删除复制过来的kernel/rpi文件夹，直接将zip复制过来，然后解压，修改解压后的文件夹名
	称为rpi
	
3.curl不兼容报错

	Unsupported curl, please use a curl not based on SecureTransport
	Jack server installation not found
	Unsupported curl, please use a curl not based on SecureTransport
	Unsupported curl, please use a curl not based on SecureTransport
	
解决办法：

	brew install curl --with-openssl
	编辑环境变量，增加以下内容：
	export PATH=$(brew --prefix curl)/bin:$PATH

4.Out of memory error (version 1.2-rc4 'Carnac' (298900 f95d7bdecfceb327f9d201a1348397ed8a843843 by android-jack-team@google.com)).

	修改Jack的配置文件prebuilts/sdk/tools/jack-admin
	将：
	JACK_SERVER_COMMAND="java -XX:MaxJavaStackTraceDepth=-1 -Djava.io.tmpdir=$TMPDIR $JACK_SERVER_VM_ARGUMENTS -cp $LAUNCHER_JAR $LAUNCHER_NAME"
	更改为：
	JACK_SERVER_COMMAND="java -XX:MaxJavaStackTraceDepth=-1 -Djava.io.tmpdir=$TMPDIR $JACK_SERVER_VM_ARGUMENTS -Xmx4096m -cp $LAUNCHER_JAR $LAUNCHER_NAME"
	
	先停止服务
	./prebuilts/sdk/tools/jack-admin stop-server
	重新开始服务
	./prebuilts/sdk/tools/jack-admin start-server
	
5./bin/bash: xgettext: command not found

解决办法：
	
	brew install gettext
	编辑环境变量，增加以下内容：
	export PATH=$(brew --prefix gettext)/bin:$PATH
	
6.烧录系统完成后，无法启动看到以下消息：
	
	[    3.621274] init: Starting service 'healthd'...
	[    3.626646] init: Starting service 'adbd'...
	[    3.628913] binder: 111:111 transaction failed 29189, size 0-0
	[    3.637741] init: cannot find '/system/bin/sh' (No such file or directory), disabling 'console'
	[    4.629075] binder: 111:111 transaction failed 29189, size 0-0
	
解决办法：
	
	检查system.img烧录是否正常，system分区大小是否正确。我的是因为分区508M太小导致的，修改分区
	大小为1G以后正常