const Joi = require('joi');
const { PROJECT, TERMINAL } = require('./constants');

// Project validation schemas
const projectSchemas = {
  create: Joi.object({
    name: Joi.string()
      .pattern(/^[a-zA-Z0-9_-]+$/)
      .min(1)
      .max(50)
      .required()
      .messages({
        'string.pattern.base': 'Project name must contain only letters, numbers, underscores, and hyphens',
        'string.min': 'Project name must be at least 1 character long',
        'string.max': 'Project name must be at most 50 characters long'
      })
  }),

  update: Joi.object({
    description: Joi.string()
      .max(200)
      .optional()
      .allow(''),
    
    
    framework: Joi.string()
      .max(50)
      .optional()
      .allow(''),
    
    settings: Joi.object({
      autoSave: Joi.boolean().optional(),
      enableHotReload: Joi.boolean().optional(),
      showHiddenFiles: Joi.boolean().optional(),
      terminalTheme: Joi.string().valid('dark', 'light').optional()
    }).optional()
  }),

  id: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'Project ID must contain only letters, numbers, underscores, and hyphens',
      'string.min': 'Project ID must be at least 1 character long',
      'string.max': 'Project ID must be at most 50 characters long'
    })
};

// Terminal validation schemas
const terminalSchemas = {
  resize: Joi.object({
    cols: Joi.number()
      .integer()
      .min(10)
      .max(300)
      .required()
      .messages({
        'number.min': 'Terminal columns must be at least 10',
        'number.max': 'Terminal columns must be at most 300'
      }),
    
    rows: Joi.number()
      .integer()
      .min(5)
      .max(100)
      .required()
      .messages({
        'number.min': 'Terminal rows must be at least 5',
        'number.max': 'Terminal rows must be at most 100'
      })
  }),

  input: Joi.object({
    data: Joi.string()
      .max(1000)
      .required()
      .messages({
        'string.max': 'Terminal input must be at most 1000 characters long'
      })
  })
};

// Claude command validation schemas
const claudeSchemas = {
  command: Joi.object({
    command: Joi.string()
      .max(2000)
      .required()
      .messages({
        'string.max': 'Claude command must be at most 2000 characters long'
      }),
    
    context: Joi.object({
      files: Joi.array()
        .items(Joi.string())
        .max(10)
        .optional()
        .messages({
          'array.max': 'Context can include at most 10 files'
        }),
      
      focus: Joi.string()
        .max(500)
        .optional()
        .messages({
          'string.max': 'Focus context must be at most 500 characters long'
        })
    }).optional()
  })
};

// System validation schemas
const systemSchemas = {
  settings: Joi.object({
    maxSessions: Joi.number()
      .integer()
      .min(1)
      .max(10)
      .optional()
      .messages({
        'number.min': 'Max sessions must be at least 1',
        'number.max': 'Max sessions must be at most 10'
      }),
    
    logLevel: Joi.string()
      .valid('error', 'warn', 'info', 'debug')
      .optional()
      .messages({
        'any.only': 'Log level must be one of: error, warn, info, debug'
      }),
    
    monitoring: Joi.object({
      enabled: Joi.boolean().optional(),
      interval: Joi.number().integer().min(1000).max(60000).optional()
    }).optional()
  })
};

// File validation schemas
const fileSchemas = {
  upload: Joi.object({
    filename: Joi.string()
      .max(255)
      .required()
      .pattern(/^[^<>:"/\\|?*\x00-\x1f]+$/)
      .messages({
        'string.max': 'Filename must be at most 255 characters long',
        'string.pattern.base': 'Filename contains invalid characters'
      }),
    
    size: Joi.number()
      .integer()
      .min(0)
      .max(PROJECT.MAX_FILE_SIZE)
      .required()
      .messages({
        'number.max': `File size must be at most ${PROJECT.MAX_FILE_SIZE} bytes`
      }),
    
    type: Joi.string()
      .max(100)
      .optional()
      .messages({
        'string.max': 'File type must be at most 100 characters long'
      })
  })
};

// Validation helper functions
const validateRequest = (schema, data, options = {}) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options
  });

  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type
    }));
    
    return {
      isValid: false,
      error: 'Validation failed',
      details
    };
  }

  return {
    isValid: true,
    value
  };
};

// Express middleware for validation
const validateMiddleware = (schema, source = 'body', paramName = null) => {
  return (req, res, next) => {
    let data;
    
    // For params validation, we need to handle the specific param field
    if (source === 'params') {
      // If paramName is provided, use it; otherwise try common param names
      if (paramName) {
        data = req.params[paramName];
      } else {
        // Try to find the actual parameter value (projectId, id, etc.)
        data = req.params.projectId || req.params.id;
      }
    } else {
      data = req[source];
    }
    
    const result = validateRequest(schema, data);
    
    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }
    
    req.validated = result.value;
    next();
  };
};

// Sanitization helpers
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .substring(0, 255);
};

const sanitizeProjectName = (name) => {
  return name
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase()
    .substring(0, 50);
};

const sanitizeCommand = (command) => {
  return command
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 2000);
};

// Export validation schemas and helpers
module.exports = {
  schemas: {
    project: projectSchemas,
    terminal: terminalSchemas,
    claude: claudeSchemas,
    system: systemSchemas,
    file: fileSchemas
  },
  
  validate: validateRequest,
  middleware: validateMiddleware,
  
  sanitize: {
    filename: sanitizeFilename,
    projectName: sanitizeProjectName,
    command: sanitizeCommand
  }
};