const express = require('express');
const config = require('config');
const fs = require('fs-extra');
const path = require('path');
const { asyncHandler } = require('../middleware/error-handler');
const logger = require('../utils/logger');
const ttydService = require('../services/ttyd-service');

const router = express.Router();

/**
 * Get TTYd service status
 */
router.get('/status', asyncHandler(async (req, res) => {
        const status = ttydService.getStatus();
        res.json({
            success: true,
            data: status
        });
}));

/**
 * Update TTYd configuration
 */
router.post('/config', asyncHandler(async (req, res) => {
        const { fontSize, port, theme } = req.body;
        
        // Validate input
        if (fontSize !== undefined) {
            const fontSizeNum = parseInt(fontSize);
            if (isNaN(fontSizeNum) || fontSizeNum < 8 || fontSizeNum > 32) {
                return res.status(400).json({
                    success: false,
                    error: 'Font size must be a number between 8 and 32'
                });
            }
        }
        
        if (port !== undefined) {
            const portNum = parseInt(port);
            if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
                return res.status(400).json({
                    success: false,
                    error: 'Port must be a number between 1024 and 65535'
                });
            }
        }

        if (theme !== undefined) {
            if (!['light', 'dark'].includes(theme)) {
                return res.status(400).json({
                    success: false,
                    error: 'Theme must be either "light" or "dark"'
                });
            }
        }

        // Update TTYd service configuration (dynamic config only)
        const updateData = {};
        if (fontSize !== undefined) updateData.fontSize = parseInt(fontSize);
        if (port !== undefined) updateData.port = parseInt(port);
        if (theme !== undefined) updateData.theme = theme;
        
        await ttydService.updateConfig(updateData);
        
        // Get updated configuration from service
        const currentStatus = ttydService.getStatus();
        
        res.json({
            success: true,
            message: 'TTYd configuration updated and service restarted',
            data: {
                fontSize: currentStatus.fontSize,
                port: currentStatus.port,
                theme: currentStatus.theme
            }
        });
}));

/**
 * Restart TTYd service manually
 */
router.post('/restart', asyncHandler(async (req, res) => {
        logger.info('Manual TTYd service restart requested');
        await ttydService.restart();
        
        res.json({
            success: true,
            message: 'TTYd service restarted successfully'
        });
}));

/**
 * Start TTYd service
 */
router.post('/start', asyncHandler(async (req, res) => {
        const started = await ttydService.start();
        
        if (started) {
            res.json({
                success: true,
                message: 'TTYd service started successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'TTYd service is already running'
            });
        }
}));

/**
 * Stop TTYd service
 */
router.post('/stop', asyncHandler(async (req, res) => {
        const stopped = await ttydService.stop();
        
        res.json({
            success: true,
            message: stopped ? 'TTYd service stopped successfully' : 'TTYd service was not running'
        });
}));

/**
 * Get TTYd configuration
 */
router.get('/config', asyncHandler(async (req, res) => {
        const status = ttydService.getStatus();
        const staticConfig = ttydService.getStaticConfig();
        
        res.json({
            success: true,
            data: {
                port: status.port,                    // Dynamic config
                fontSize: status.fontSize,            // Dynamic config
                theme: status.theme,                  // Dynamic config
                executable: staticConfig.executable,  // Static config
                baseCommand: staticConfig.baseCommand, // Static config
                arguments: staticConfig.arguments      // Static config
            }
        });
}));

module.exports = router;