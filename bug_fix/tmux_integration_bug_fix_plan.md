# Tmux Integration Bug Fix Plan

## Overview
Add tmux integration to maintain persistent terminal sessions across devices, allowing users to close the web interface and continue sessions from different devices.

## Current State Analysis
- Terminal sessions use node-pty directly
- Sessions are ephemeral and stored only in memory
- No persistence or reconnection capabilities
- Sessions are lost on disconnect/reconnect

## Implementation Steps

### Step 1: Add tmux dependency and utility module
- Install tmux on the system (prerequisite)
- Create `server/utils/tmux-utils.js` for tmux command wrappers
- Implement tmux session naming convention (project-based)

### Step 2: Enhance TerminalSession class
- Modify `server/services/terminal-service.js`
- Change terminal spawn to use tmux sessions
- Add methods for:
  - Creating new tmux sessions
  - Attaching to existing sessions
  - Detaching from sessions
  - Listing available sessions

### Step 3: Implement session discovery
- Add startup logic to discover existing tmux sessions
- Map discovered sessions to projects
- Clean up orphaned sessions

### Step 4: Update socket handlers
- Modify `server/socket-handler.js`
- Add events for:
  - `terminal:list-sessions`
  - `terminal:attach-session`
  - `terminal:detach-session`
- Update connection logic to check for existing sessions

### Step 5: Client-side enhancements
- Update `public/assets/js/terminal.js`
- Add session status indicators
- Show available sessions per project
- Add attach/detach controls

### Step 6: Configuration updates
- Add tmux configuration options to config files
- Session timeout settings
- Cleanup policies

## Technical Details

### Tmux Session Naming
```
Format: claude-web-{projectId}-{timestamp}
Example: claude-web-project1-1704067200
```

### Session Metadata Storage
Store session metadata in a JSON file:
```json
{
  "sessions": {
    "project1": {
      "tmuxSession": "claude-web-project1-1704067200",
      "created": "2024-01-01T00:00:00Z",
      "lastAccessed": "2024-01-01T00:00:00Z"
    }
  }
}
```

### Key Commands
- Create session: `tmux new-session -d -s {sessionName}`
- Attach to session: `tmux attach-session -t {sessionName}`
- List sessions: `tmux list-sessions -F "#{session_name}"`
- Check if session exists: `tmux has-session -t {sessionName}`

## Testing Plan
1. Create terminal session via web interface
2. Close browser/disconnect
3. Open on different device/browser
4. Verify session persistence and ability to continue work
5. Test multiple concurrent sessions
6. Test session cleanup

## Rollback Plan
- Keep original terminal service code
- Add feature flag to enable/disable tmux integration
- Provide fallback to direct node-pty if tmux unavailable

## Success Criteria
- Sessions persist across browser/device changes
- Seamless reconnection to existing sessions
- No data loss on disconnect
- Proper cleanup of abandoned sessions