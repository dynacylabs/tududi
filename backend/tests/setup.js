// Jest setup file to mock OIDC service before any tests run
// This prevents openid-client ES module from being loaded

jest.mock('../services/oidcService', () => ({
    initializeOIDC: jest.fn().mockResolvedValue(undefined),
    getOIDCClient: jest.fn().mockReturnValue(null),
    getAuthorizationUrl: jest.fn().mockReturnValue('https://mock-auth-url.com'),
    handleCallback: jest.fn().mockResolvedValue({
        sub: 'mock-sub-123',
        email: 'test@example.com',
        name: 'Test User',
    }),
}));
