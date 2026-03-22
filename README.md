# Vocabulary Learning Assistant (单词学习助手)

一个轻量级、功能强大的在线单词测试与复盘系统。专为词汇学习设计，支持自定义题库、动态打乱、错题分析及全方位的管理后台。

## 🌟 核心特性

- **双端系统**：
  - **学生端**：简洁直观的答题界面，支持即时解析对比。
  - **管理端**：题库上传、学生管理、答题历史监控、全局配置调整。
- **智能出题逻辑**：
  - **选项随机化**：每次测试的选项顺序都会随机打乱，杜绝死记硬背。
  - **题量控制**：支持从大题库中随机抽取固定数量的题目。
  - **Seed 还原机制**：利用轻量级种子记录，完美还原当时的打乱现场进行复盘。
- **深度学习反馈**：
  - **解析(Rationale)对比**：答错时同时展示“正确选项解析”与“所选错误选项解析”。
  - **错题回顾**：结果页自动汇总本次测试的所有错题。
- **极致性能优化**：
  - **数据瘦身**：历史记录采用极限压缩格式，单条记录体积缩减 80% 以上。
  - **身份隔离**：管理员与学生登录状态完全独立，互不影响。

## 🛠️ 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML5 + CSS3 (Glassmorphism 风格) + JavaScript (ES6+)
- **数据格式**：YAML (题库) + JSON (配置与历史)
- **安全**：JWT (JSON Web Token) + HTTP-Only Cookies

## 🚀 快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 配置文件
确保 `data/settings.json` 已创建并配置了初始属性：
```json
{
  "adminPassword": "你的管理员密码",
  "allowedStudents": ["学生姓名1", "学生姓名2"],
  "activeQuizzes": []
}
```

### 3. 启动服务
```bash
npm start
```
服务默认运行在：`http://localhost:3000`

## 📂 目录结构

- `/public`: 前端资源文件 (HTML, CSS, JS)
- `/parctice`: 存放 YAML 格式的原始题库
- `/data`: 存放系统配置 (`settings.json`) 与答题记录 (`scores.json`)
- `/server.js`: 后端核心逻辑

## 📝 题库格式示例 (YAML)

题库文件需放置在 `/parctice` 目录下：

```yaml
quiz_title: "词汇练习第一课"
questions:
  - id: 1
    text: "The heavy rain had a negative _______ on the crops."
    options:
      - text: "effect"
        is_correct: true
        rationale: "'effect' 是名词，表示结果/影响。"
      - text: "affect"
        is_correct: false
        rationale: "'affect' 通常是动词。"
    hint: "提示：这里需要一个名词。"
```

## 🔒 权限说明

- **学生端**：需在 `settings.json` 的 `allowedStudents` 列表中方可登录。
- **管理端**：访问 `/admin.html`，需输入管理员密码。

---
Made with ❤️ for better vocabulary learning.
