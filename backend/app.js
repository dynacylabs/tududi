require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('passport');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { sequelize } = require('./models');
const { initializeTelegramPolling } = require('./services/telegramInitializer');
const taskScheduler = require('./services/taskScheduler');
const { setConfig, getConfig } = require('./config/config');
const { initializePassport } = require('./config/passport');
const config = getConfig();

const app = express();

// Trust proxy if behind reverse proxy (like nginx, traefik, etc.)
app.set('trust proxy', 1);

// Session store
const sessionStore = new SequelizeStore({
    db: sequelize,
});

// Middlewares
app.use(
    helmet({
        hsts: false,
        forceHTTPS: false,
        contentSecurityPolicy: false,
    })
);
app.use(compression());
app.use(morgan('combined'));

// CORS configuration
app.use(
    cors({
        origin: config.allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Authorization',
            'Content-Type',
            'Accept',
            'X-Requested-With',
        ],
        exposedHeaders: ['Content-Type'],
        maxAge: 1728000,
    })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
// Dynamic secure cookie handling for reverse proxy scenarios
const sessionConfig = {
    secret: config.secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true, // Trust the reverse proxy
    cookie: {
        httpOnly: true,
        secure: 'auto', // Automatically set based on X-Forwarded-Proto header
        maxAge: 2592000000, // 30 days
        sameSite: 'lax', // 'lax' allows cookies on top-level navigation (OIDC redirects)
        path: '/', // Ensure cookie is available for all paths
    },
    name: 'tududi.sid', // Custom session cookie name to avoid conflicts
};

app.use(session(sessionConfig));

// Initialize Passport
initializePassport();
app.use(passport.initialize());
app.use(passport.session());

// Static files
if (config.production) {
    app.use(express.static(path.join(__dirname, 'dist')));
} else {
    app.use(express.static('public'));
}

// Serve locales
if (config.production) {
    app.use('/locales', express.static(path.join(__dirname, 'dist/locales')));
} else {
    app.use(
        '/locales',
        express.static(path.join(__dirname, '../public/locales'))
    );
}

// Serve uploaded files
app.use('/api/uploads', express.static(config.uploadPath));

// Authentication middleware
const { requireAuth } = require('./middleware/auth');
const { logError } = require('./services/logService');

// Health check (before auth middleware) - ensure it's completely bypassed
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.environment,
    });
});

// Routes
app.use('/api', require('./routes/auth'));
app.use('/api', requireAuth, require('./routes/tasks'));
app.use('/api', requireAuth, require('./routes/projects'));
app.use('/api', requireAuth, require('./routes/admin'));
app.use('/api', requireAuth, require('./routes/shares'));
app.use('/api', requireAuth, require('./routes/areas'));
app.use('/api', requireAuth, require('./routes/notes'));
app.use('/api', requireAuth, require('./routes/tags'));
app.use('/api', requireAuth, require('./routes/users'));
app.use('/api', requireAuth, require('./routes/inbox'));
app.use('/api', requireAuth, require('./routes/url'));
app.use('/api', requireAuth, require('./routes/telegram'));
app.use('/api', requireAuth, require('./routes/quotes'));
app.use('/api', requireAuth, require('./routes/task-events'));

// SPA fallback
app.get('*', (req, res) => {
    if (
        !req.path.startsWith('/api/') &&
        !req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg)$/)
    ) {
        if (config.production) {
            res.sendFile(path.join(__dirname, 'dist', 'index.html'));
        } else {
            res.sendFile(path.join(__dirname, '../public', 'index.html'));
        }
    } else {
        res.status(404).json({
            error: 'Not Found',
            message: 'The requested resource could not be found.',
        });
    }
});

// Error handling fallback.
// We shouldn't be here normally!
// Each route should properly handle
// and log its own errors.
app.use((err, req, res, next) => {
    logError(err);
    res.status(500).json({
        error: 'Internal Server Error',
        // message: err.message,
    });
});

// Initialize database and start server
async function startServer() {
    try {
        // Create session store table
        await sessionStore.sync();

        // Initialize Telegram polling after database is ready
        await initializeTelegramPolling();

        // Initialize task scheduler
        await taskScheduler.initialize();

        const server = app.listen(config.port, config.host, () => {
            console.log(`Server running on port ${config.port}`);
            console.log(`Server listening on http://localhost:${config.port}`);
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = app;
