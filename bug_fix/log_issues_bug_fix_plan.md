# Bug Fix Plan: Log Issues in Claude Code Web Manager

## Issues Identified

### 1. Critical Issue: Projects Directory Not Found
- **Error**: `ENOENT: no such file or directory, scandir '/home/pi/projects'`
- **Impact**: Application crashes on startup with unhandled rejection
- **Root Cause**: The default projects directory path is hardcoded to `/home/pi/projects` but the application is running under user `distiller` not `pi`

### 2. Configuration Warning: NODE_APP_INSTANCE
- **Warning**: `NODE_APP_INSTANCE value of '0' did not match any instance config file names`
- **Impact**: Minor - causes warning messages in logs but doesn't affect functionality
- **Root Cause**: PM2 sets NODE_APP_INSTANCE=0 for single instance apps, but node-config expects instance-specific config files

## Fix Implementation Steps

### Step 1: Fix Projects Directory Path
1. Update the default projects path in constants.js to use a more flexible approach
2. Options:
   - Use `process.env.HOME` to dynamically set the path
   - Create the directory if it doesn't exist in the service
   - Add better error handling for missing directory

### Step 2: Fix NODE_APP_INSTANCE Warning
1. Add instance configuration to suppress the warning
2. Options:
   - Set `NODE_CONFIG_STRICT_MODE=false` in PM2 config
   - Create instance-specific config file
   - Configure node-config to ignore instance warnings

### Step 3: Improve Error Handling
1. Add try-catch in app initialization to handle startup errors gracefully
2. Ensure the application doesn't crash on missing directories
3. Add proper logging for directory creation

### Step 4: Testing
1. Test with current user (distiller)
2. Verify projects directory is created automatically
3. Confirm no more unhandled rejections
4. Check that NODE_APP_INSTANCE warnings are resolved

## Implementation Priority
1. Fix projects directory issue (Critical - prevents app startup)
2. Improve error handling (High - prevents crashes)
3. Fix NODE_APP_INSTANCE warning (Low - cosmetic issue)