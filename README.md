# AI Sidebar Chat

[![Version](https://img.shields.io/badge/version-1.1-blue.svg)](https://github.com/wesele/ai-sidebar-chat/releases/tag/v1.1)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](#english) | [中文](#中文) | [Español](#español)

---

## English

A Gemini-style AI chat sidebar extension for Chrome (Manifest V3).

### Features

- Side panel chat interface
- AI-powered conversation
- Persistent storage for chat history
- Modern, clean UI design
- Works on all websites

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/wesele/ai-sidebar-chat.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked" and select the cloned directory

5. Click the extension icon to open the sidebar chat

### Usage

- Click the extension icon in the Chrome toolbar to toggle the sidebar
- Type your message in the chat input
- Press Enter or click Send to send your message
- Chat history is automatically saved

### Files

- `manifest.json` - Extension manifest (Manifest V3)
- `background.js` - Background service worker
- `sidepanel.html` - Sidebar HTML structure
- `script.js` - Main application logic
- `styles.css` - Styling
- `icons/` - Extension icons

### License

MIT

---

## 中文

一个类似 Gemini 风格的 AI 聊天侧边栏扩展（Chrome Manifest V3）。

### 功能特点

- 侧边栏聊天界面
- AI 驱动的对话
- 持久化存储聊天记录
- 现代简洁的 UI 设计
- 支持所有网站

### 安装方法

1. 克隆此仓库：
   ```bash
   git clone https://github.com/wesele/ai-sidebar-chat.git
   ```

2. 打开 Chrome 并访问 `chrome://extensions/`

3. 启用"开发者模式"（右上角开关）

4. 点击"加载已解压的扩展程序"并选择克隆的目录

5. 点击扩展图标打开侧边栏聊天

### 使用方法

- 点击 Chrome 工具栏中的扩展图标来切换侧边栏
- 在聊天输入框中输入消息
- 按 Enter 键或点击发送按钮发送消息
- 聊天记录会自动保存

### 文件说明

- `manifest.json` - 扩展清单 (Manifest V3)
- `background.js` - 后台服务
- `sidepanel.html` - 侧边栏 HTML 结构
- `script.js` - 主应用程序逻辑
- `styles.css` - 样式文件
- `icons/` - 扩展图标

### 许可证

MIT

---

## Español

Una extensión de barra lateral de chat con IA estilo Gemini para Chrome (Manifest V3).

### Características

- Interfaz de chat en panel lateral
- Conversación impulsada por IA
- Almacenamiento persistente del historial de chat
- Diseño moderno y limpio
- Funciona en todos los sitios web

### Instalación

1. Clona este repositorio:
   ```bash
   git clone https://github.com/wesele/ai-sidebar-chat.git
   ```

2. Abre Chrome y navega a `chrome://extensions/`

3. Activa el "Modo de desarrollador" (interruptor en la esquina superior derecha)

4. Haz clic en "Cargar descomprimida" y selecciona el directorio clonado

5. Haz clic en el icono de la extensión para abrir el chat lateral

### Uso

- Haz clic en el icono de la extensión en la barra de herramientas de Chrome para mostrar/ocultar la barra lateral
- Escribe tu mensaje en el campo de entrada del chat
- Presiona Enter o haz clic en Enviar para mandar el mensaje
- El historial de chat se guarda automáticamente

### Archivos

- `manifest.json` - Manifiesto de la extensión (Manifest V3)
- `background.js` - Service worker en segundo plano
- `sidepanel.html` - Estructura HTML de la barra lateral
- `script.js` - Lógica principal de la aplicación
- `styles.css` - Estilos
- `icons/` - Iconos de la extensión

### Licencia

MIT

---

## Changelog

### v1.1 (2026-02-25)

#### Added
- Enhanced chat functionality with improved message handling
- New UI elements and styling improvements
- Extended features in sidepanel.html

#### Changed
- Updated script.js with additional features (+288 lines)
- Improved styles.css with new design elements (+64 lines)
- Enhanced sidepanel.html structure (+27 lines)

### v1.0 (2026-02-25)

- Initial release
- Basic sidebar chat interface
- AI-powered conversation support
- Persistent storage for chat history
