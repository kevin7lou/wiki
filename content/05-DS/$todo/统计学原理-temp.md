icon:: 
title:: 统计学原理-temp
alias:: 
category:: [[读书笔记]]
tags:: 数学, 统计学,


-
- # 2.概率分布
	- ## 2.1 概率
		- **随机变量**（random variable）：用概率定义要取的值有多容易出现的变量。
	- ## 2.2 概率分布（probability distribution）
		- 连续型分布
			- 均匀分布
			- 离散均匀分布
				- 当值为 [插图] 时，平均数为 [插图]，方差为
				- > **Note**: Logseq team has published [its official solution](https://github.com/logseq/publish-spa). As a result, I will archive mine here. Thanks for your supports thus far!
- -------
- [[9_todo/temp/DS-统计学笔记-第0周]]
- [[9_todo/temp/DS-统计学笔记-第1周]]
- [[9_todo/DS-Cover-DS成长之路]]
- [[9_todo/temp/DS-Chap01-探索性数据分析]]
- {{embed [[9_todo/temp/DS-统计学笔记-第0周]]}}
- # 正态分布
	- [通俗统计学原理入门1 从抛硬币到正态分布 正态分布 伯努利实验 方差_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1z44y1C7rd/?spm_id_from=pageDriver&vd_source=e3922e1d88d594a8750a72f54321a63f)
		- 定义
		- aka 高斯分布
		- 意义：总体中所有的数偏离平均值的程度
		- 定义
		- 概率密度函数（Probability Density Function，PDF）
		- 公式：f(x)=\frac{1}{\sqrt{2 \pi}} e^{-\frac{(\mu-x)^2}{2 \sigma^2}}f(x)=2π​1​e−2σ2(μ−x)2​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
		- 其中，​​​ 为期望，即曲线中的对称轴；​​​​​​​​ 为方差
		- 表示**随机变量每个取值有多大的可能性**
		- **正态分布**的[概率密度函数](http://zh.wikipedia.org/wiki/%E6%A6%82%E7%8E%87%E5%AF%86%E5%BA%A6%E5%87%BD%E6%95%B0)均值为μ [方差](http://zh.wikipedia.org/wiki/%E6%96%B9%E5%B7%AE)为σ2 (或[标准差](http://zh.wikipedia.org/wiki/%E6%A8%99%E6%BA%96%E5%B7%AE)σ)是[高斯函数](http://zh.wikipedia.org/wiki/%E9%AB%98%E6%96%AF%E5%87%BD%E6%95%B8)的一个实例：
		- 68-95-99法则
		- ![](https://api2.mubu.com/v3/document_image/683eb161-e03d-435d-823c-4c0f2526268e-12162351.jpg)
		- 中心极限定理
		- 均值抽样分布（Sampling Distribution）
		- 样本容量
		- 中心极限定理
		-
		- 均值抽样分布（Sampling Distribution）
		- 样本容量
		- 样本平均值 \overline{\mathrm{X}}=\frac{\sum \mathrm{X}_{\mathrm{i}}}{\mathrm{n}}X=n∑Xi​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
		- 定义：对一个总体进行大量重复的随机抽样并计算均值，并将每次的抽样均值在坐标轴上用柱状图来表示频次高低，最终将得到一个正态分布的轮廓，且此整体分布的对称轴所示的值，即为总体的真实均值 \muμ​​​ 。抽样的样本容量n越大，则显现出整体分布轮廓所需要的抽样次数越少。
		-
		- ![](https://api2.mubu.com/v3/document_image/c5ae848e-e17c-4716-a668-0f3dc38deba5-12162351.jpg)
		- [通俗统计学原理入门 -外1篇 正态分布 中心极限定理 中庸 知行合一_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1Md4y1A7sa/?vd_source=e3922e1d88d594a8750a72f54321a63f)
		- 假设检验
-
- ![image.png](../assets/image_1662954548137_0.png)
  
  
  -----
- 
- {{renderer :tocgen}}
-
	-
		-
- -------
- # 正态分布
	- [通俗统计学原理入门1 从抛硬币到正态分布 正态分布 伯努利实验 方差_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1z44y1C7rd/?spm_id_from=pageDriver&vd_source=e3922e1d88d594a8750a72f54321a63f)
		- 定义
		- aka 高斯分布
		- 意义：总体中所有的数偏离平均值的程度
		- 定义
		- 概率密度函数（Probability Density Function，PDF）
		-
		- 公式：$$f(x)=\frac{1}{\sqrt{2 \pi}} e^{-\frac{(\mu-x)^2}{2 \sigma^2}}f(x)=2π​1​e−2σ2(μ−x)2​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​$$
		- 其中，​​​ 为期望，即曲线中的对称轴；​​​​​​​​ 为方差
		- 表示**随机变量每个取值有多大的可能性**
		- **正态分布**的[概率密度函数](http://zh.wikipedia.org/wiki/%E6%A6%82%E7%8E%87%E5%AF%86%E5%BA%A6%E5%87%BD%E6%95%B0)均值为μ [方差](http://zh.wikipedia.org/wiki/%E6%96%B9%E5%B7%AE)为σ2 (或[标准差](http://zh.wikipedia.org/wiki/%E6%A8%99%E6%BA%96%E5%B7%AE)σ)是[高斯函数](http://zh.wikipedia.org/wiki/%E9%AB%98%E6%96%AF%E5%87%BD%E6%95%B8)的一个实例：
		- 68-95-99法则
		- ![](https://api2.mubu.com/v3/document_image/683eb161-e03d-435d-823c-4c0f2526268e-12162351.jpg)
		- 中心极限定理
		- 均值抽样分布（Sampling Distribution）
		- 样本容量
		- 中心极限定理
		-
		- 均值抽样分布（Sampling Distribution）
		- 样本容量
		- 样本平均值 \overline{\mathrm{X}}=\frac{\sum \mathrm{X}_{\mathrm{i}}}{\mathrm{n}}X=n∑Xi​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​​
		- 定义：对一个总体进行大量重复的随机抽样并计算均值，并将每次的抽样均值在坐标轴上用柱状图来表示频次高低，最终将得到一个正态分布的轮廓，且此整体分布的对称轴所示的值，即为总体的真实均值 \muμ​​​ 。抽样的样本容量n越大，则显现出整体分布轮廓所需要的抽样次数越少。
		-
		- ![](https://api2.mubu.com/v3/document_image/c5ae848e-e17c-4716-a668-0f3dc38deba5-12162351.jpg)
		- [通俗统计学原理入门 -外1篇 正态分布 中心极限定理 中庸 知行合一_哔哩哔哩_bilibili](https://www.bilibili.com/video/BV1Md4y1A7sa/?vd_source=e3922e1d88d594a8750a72f54321a63f)
		- 假设检验
		- dddddddddd
-
- ![image.png](../assets/image_1662954548137_0.png)