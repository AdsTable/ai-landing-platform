import { body, param, query, validationResult } from "express-validator";

// Generic validation error handler
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: errors.array()
        });
    }
    next();
};

// Page generation validation
export const validatePageGeneration = [
    body('industry')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Industry must be 1-100 characters'),
    
    body('location')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Location must be 1-100 characters'),
    
    body('type')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Type must be 1-100 characters'),
    
    body('lang')
        .isString()
        .isLength({ min: 2, max: 5 })
        .matches(/^[a-z]{2}(-[A-Z]{2})?$/)
        .withMessage('Language must be valid ISO code (e.g., en, en-US)'),
    
    handleValidationErrors
];

// Translation validation
export const validateTranslation = [
    body('text')
        .isString()
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('Text must be 1-5000 characters'),
    
    body('targetLang')
        .isString()
        .isLength({ min: 2, max: 5 })
        .matches(/^[a-z]{2}(-[A-Z]{2})?$/)
        .withMessage('Target language must be valid ISO code'),
    
    handleValidationErrors
];

// Push notification validation
export const validatePushMessage = [
    body('title')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be 1-100 characters'),
    
    body('message')
        .isString()
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('Message must be 1-500 characters'),
    
    handleValidationErrors
];

// User management validation
export const validateUserCreation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email required'),
    
    body('password')
        .isLength({ min: 8 })
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must be 8+ chars with uppercase, lowercase, number, and special character'),
    
    body('username')
        .isString()
        .trim()
        .isLength({ min: 3, max: 30 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username must be 3-30 alphanumeric characters'),
    
    handleValidationErrors
];

// API parameter validation
export const validateApiKey = param('key')
    .isString()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Invalid API key format');

export const validatePagination = [
    query('page')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Page must be integer 1-1000'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be integer 1-100'),
    
    handleValidationErrors
];

// SEO validation
export const validateSeoUrl = [
    body('url').isURL().withMessage('Valid URL required'),
    handleValidationErrors
];

export const validateKeywordGeneration = [
    body('topic').isString().trim().isLength({ min: 1, max: 200 }).withMessage('Topic required'),
    handleValidationErrors
];
