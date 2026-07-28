# AI Sidebar Chat

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/wesele/ai-sidebar-chat/releases/tag/v1.2.0)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](#english) | [中文](#中文) | [Español](#español)

---

## English

A Gemini-style AI chat sidebar extension for Chrome (Manifest V3).

### Writing assistant development

The new writing assistant is implemented under `src/` with a DOM-free text/analysis domain, content-script owned ephemeral document cache, a background-only provider transport, and a read-only Side Panel projection. Run `npm.cmd install`, then `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`, and (where Chrome/Edge are installed) `npm.cmd run test:e2e`. The packaged-extension smoke additionally requires `RUN_EXTENSION_E2E=1` and a browser channel that permits side-loaded MV3 extensions; it uses only the local fake provider in `scripts/fixture-server.mjs`. Packaged manifests are in `manifest/`; the legacy root panel remains available while the Vite build emits the new module entries.

### Features

- Side panel chat interface
- AI-powered conversation
- Persistent storage for chat history
- Modern, clean UI design
- Works on all websites
- **Multiple AI Provider Support**: Configure and switch between different AI providers
- **Model Configuration Export/Import**: Backup and restore your provider configurations
- **Smart Model Selection**: Filter and search models with fuzzy matching
- **Visual Model Management**: Easy-to-use list interface for managing models
- **Multilingual Support**: English, Chinese (中文), and Spanish (Español)

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/wesele/ai-sidebar-chat.git
   ```

2. Install dependencies and build the extension:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable "Developer mode" (toggle in top-right corner)

5. Click "Load unpacked" and select the generated `dist` directory (not the source repository root)

6. Click the extension icon to open the sidebar chat

### Usage

- Click the extension icon in the Chrome toolbar to toggle the sidebar
- Type your message in the chat input
- Press Enter or click Send to send your message
- Chat history is automatically saved
- Configure AI providers by clicking "API Config" button
- Export/import model configurations for backup or sharing
- Use the filter to quickly find models when adding from API

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
- **多 AI 供应商支持**：配置和切换不同的 AI 供应商
- **模型配置导出/导入**：备份和恢复您的供应商配置
- **智能模型选择**：使用模糊匹配过滤和搜索模型
- **可视化模型管理**：易于使用的列表界面管理模型
- **多语言支持**：英语、中文和西班牙语

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
- 点击"API配置"按钮配置 AI 供应商
- 导出/导入模型配置以备份或分享
- 使用过滤器从 API 添加模型时快速查找模型

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
- **Soporte de múltiples proveedores de IA**: Configura y cambia entre diferentes proveedores de IA
- **Exportar/Importar configuración de modelos**: Haz copias de seguridad y restaura tus configuraciones de proveedores
- **Selección inteligente de modelos**: Filtra y busca modelos con coincidencia difusa
- **Gestión visual de modelos**: Interfaz de lista fácil de usar para gestionar modelos
- **Soporte multilingüe**: Inglés, chino (中文) y español (Español)

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
- Configura proveedores de IA haciendo clic en el botón "Config. API"
- Exporta/importa configuraciones de modelos para respaldo o compartir
- Usa el filtro para encontrar rápidamente modelos al agregar desde la API

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

### v1.2.0 (2026-03-08)

#### Added
- **Model Configuration Export/Import**: Export and import provider configurations to/from JSON files
- **Model Filtering**: Added filter input in model selection modal with fuzzy search capability
- **Auto-selection**: Already selected models are automatically marked with checkboxes
- **Visual Model List**: Changed from comma-separated text input to a visual list format
- **Model Management**: Add models manually with input field and delete individual models with × button
- **Empty State**: Shows "No models" message when model list is empty
- **No Results Message**: Displays message when filter matches no models

#### Changed
- Improved model selection UI with better visual hierarchy
- Enhanced user experience for managing provider models
- Updated translations for all new features (English, Chinese, Spanish)

#### Technical
- Added `exportModelConfig()` function for exporting provider configurations
- Added `importModelConfig()` function for importing and merging provider configurations
- Added `renderModelsList()` function for visual model list rendering
- Enhanced `renderModelCheckboxList()` to support filtering and auto-selection
- Added `allAvailableModels` state variable for filtering
- Updated manifest version to 1.2.0

### v1.1 (2026-02-25)

#### Added
- **Multilingual Support**: Added support for English, Chinese (中文), and Spanish (Español)
- Language selector in the UI for easy switching between languages
- Full translation of all UI elements and messages

#### Changed
- Updated README with multilingual documentation
- Enhanced user interface for language switching

### v1.0 (2026-02-25)

- Initial release
- Basic sidebar chat interface
- AI-powered conversation support
- Persistent storage for chat history
