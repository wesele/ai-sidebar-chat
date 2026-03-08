# Release Notes

## Version 1.2.0 (2026-03-08)

### 🎉 New Features

#### 1. Model Configuration Export/Import
- **Export Model Config**: Added button to export all provider configurations to a JSON file
  - Exports provider names, base URLs, API keys, and model lists
  - Includes metadata (export date, version)
  - Downloads as `model_config.json` with formatted JSON
- **Import Model Config**: Added button to import provider configurations from a JSON file
  - Validates imported JSON structure
  - Smart merge: Avoids duplicate providers by checking IDs
  - Shows success message with count of imported providers
  - Refreshes UI automatically if modal is open during import
- **Location**: API Configuration Modal footer

#### 2. Model Selection Enhancements
- **Filter Input**: Added text input for filtering models in the model selection modal
  - Real-time fuzzy filtering as you type
  - Case-insensitive substring matching
  - Shows "no results" message when filter matches nothing
- **Auto-selection**: Already selected models are automatically marked with checkboxes
  - Checks models that are already in the current provider's list
  - Prevents duplicate additions
- **Location**: Model Selection Modal

#### 3. Improved Model List Management
- **Visual List Format**: Changed from comma-separated text input to a visual list
  - Each model displayed as an individual item
  - Scrollable container for large model collections
  - Clear visual separation between models
- **Add Models**: Input field and button to manually add models
  - Validates input and prevents duplicates
  - Supports Enter key to add model
  - Clears input after successful addition
- **Delete Models**: Each model item has a delete button (×)
  - Removes model from provider's list immediately
  - Refreshes display automatically
- **Empty State**: Shows "No models" message when list is empty
- **Location**: Provider configuration form in API Configuration Modal

### 🌍 Internationalization
All new features support multiple languages:
- English (en)
- Chinese (zh-CN)
- Spanish (es)

New translation keys:
- `exportModelConfig` / `importModelConfig`
- `filterModels`
- `modelsList`
- `addModel`
- `addModelPlaceholder`
- `noModels`

### 🎨 UI/UX Improvements
- **Better Visual Hierarchy**: Model list items have clear separation and hover effects
- **Responsive Design**: Scrollable lists for large model collections
- **User Feedback**: Success messages and empty state indicators
- **Consistent Styling**: All new elements follow existing design patterns

### 📝 Technical Details

#### Files Modified
- `sidepanel.html`: Added export/import buttons, filter input, and model list container
- `script.js`: 
  - Added export/import functions
  - Enhanced model selection with filtering
  - Implemented visual model list management
  - Updated translations
  - Added event listeners
- `styles.css`: Added styling for model list, delete buttons, and filter results

#### New Functions
- `exportModelConfig()`: Exports provider configurations to JSON
- `importModelConfig()`: Imports and merges provider configurations
- `renderModelsList()`: Renders models as visual list items
- Enhanced `renderModelCheckboxList()`: Supports filtering and auto-selection

#### New State Variables
- `allAvailableModels`: Stores all fetched models for filtering

### 🐛 Bug Fixes
None in this release

### 🔧 Breaking Changes
None in this release

### 📦 Installation
No special installation required. Simply replace the existing files with the new versions.

### 🔄 Migration
No migration needed. All changes are backward compatible.

### 🙏 Acknowledgments
Thanks to the community for the feedback and feature requests that made this release possible!

---

## Previous Versions

### Version 1.1.0
- Initial release with basic chat functionality
- Multi-language support (English, Chinese, Spanish)
- API configuration for multiple providers
- Context management
- Message history

### Version 1.0.0
- First public release
