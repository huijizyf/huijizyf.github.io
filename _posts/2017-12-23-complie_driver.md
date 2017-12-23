---
layout: post
title: 为OrangePi One 编译无线网卡驱动
category: 安卓
tag: [安卓,wifi驱动,源码,orange pi,编译]
---


因为购买的OrangePi One是带以太网口的，但是不带无线网卡，正巧手里有朋友给的一个USB无线网卡，于是就尝试去找到网卡的驱动，并进行编译。

<h3>材料</h3>

需要准备的东西如下：

	1.Orange Pi One ubuntu 14 系统
	2.网线
	3.802.11n无线网卡
	4.Macbook
	
<h3>步骤</h3>

1.因USB无线网卡上没有标识，看不到品牌和型号，将usb无线网卡插入mac，打开终端输入：lsusb
看到以下内容：

	Realtek Semiconductor Corp. 802.11n NIC  Serial: 00E04C0001
	
![](/images/complie_driver/lsusb.png)
	
2.根据以上信息找到驱动包：rtl8188eu_USB_linux.tar.gz

3.将驱动包下载至Orange pi one 下载地址：
	
	链接:https://pan.baidu.com/s/1c2My8LU  密码:qm04

4.解压包，执行以下命令：
	
	cd rtl8188eu_USB_linux
	cd driver/rtl8188eu
	make	(如果这里出错，请看后面的解决办法)

![](/images/complie_driver/complie_success.png)

5.加载驱动,经过第四步的编译，我们已经得到了8188eu.ko文件，在终端输入以下命令，加载驱动：
	
	modprobe 8188eu

6.网卡插入 orange pi one ，执行ifconfig，可以看见比之前多出了wlan0和wlan1的信息，驱动加载成功
![](/images/complie_driver/modprobe_success.png)
7.接下来就可以使用wpa_supplicant来进行联网了
![](/images/complie_driver/all.png)

<h3>错误解决办法</h3>

1.内核头文件不存在或出现以下提示

	make[2]: *** No rule to make target `include/config/auto.conf'.  Stop.
	make[1]: *** [modules] Error 2
	make[1]: Leaving directory `/lib/modules/linux-3.4'
	make: *** [modules] Error 2

解决办法：
	
	如果提示内核头文件不存在，将内核源码复制到orange pi上 然后创建软链接。
	ln -s /lib/modules/linux-3.4 /lib/modules/3.4.39-01-lobo/build
	ln -s /lib/modules/linux-3.4 /lib/modules/3.4.39-01-lobo/source
	
	如果出现No rule to make target `include/config/auto.conf'.  Stop.
	cd /lib/modules/linux-3.4
	make zImage(如果报错了，应该也没关系)
	等待执行一段时间后按ctrl + c终止执行 后 再回到驱动目录开始编译
	
	
	