---
layout: default
title: About
---

<div class="post">
<p>yufei.zhou.</p><br>
安卓程序员，热爱生活，热爱新技术。
<br>
<br>

{% highlight c %}
纸上得来终觉浅，绝知此事要躬行。
{% endhighlight %}

<br>
<br>

<img src="/images/avatar.png" class="right" />

<br>
<h3>技能清单</h3>

- 安卓开发<br>
- Python<br>
- Linux<br>

<br>
<br>
<h3>联系方式</h3>
- Email huijizyf@outlook.com<br>

</div>

<script src="/assets/js/post.js"></script>
<div class="post-list-body">
			{% for category in site.categories %}
				<div post-cate="{{category | first}}">

			          <ul class="posts">
			            {% for posts in category  %}
			              {% for post in posts %}
			                {% if post.url %}
					<li>
			                  <a href="{{ post.url }}" class="post-list-item">
			                    <h2>{{ post.title }}</h2>
			                    <span class="date">{{ post.date | date: "%b %-d, %Y" }}</span>
			                  </a>
					</li>
			                {% endif %}
			              {% endfor %}
			            {% endfor %}
			          </ul>
				</div>
	        {% endfor %}
</div>