import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [oidcEnabled, setOidcEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    // Check if user explicitly wants password login
    const usePasswordLogin = searchParams.get('password') === 'true';

    useEffect(() => {
        // Check if OIDC is enabled
        fetch('/api/auth/oidc/config')
            .then((res) => res.json())
            .then((data) => {
                setOidcEnabled(data.enabled);
                setLoading(false);
                
                // Automatically redirect to OIDC login if enabled and not explicitly using password
                if (data.enabled && !usePasswordLogin) {
                    window.location.href = '/api/auth/oidc/login';
                }
            })
            .catch((err) => {
                console.error('Failed to fetch OIDC config:', err);
                setLoading(false);
            });
    }, [usePasswordLogin]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include',
            });

            const data = await response.json();

            if (response.ok) {
                if (data.user && data.user.language) {
                    await i18n.changeLanguage(data.user.language);
                }

                window.dispatchEvent(
                    new CustomEvent('userLoggedIn', { detail: data.user })
                );

                navigate('/today');
            } else {
                setError(data.errors[0] || 'Login failed. Please try again.');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
            console.error('Error during login:', err);
        }
    };

    const handleOidcLogin = () => {
        window.location.href = '/api/auth/oidc/login';
    };

    // Show loading state while checking OIDC config
    if (loading) {
        return (
            <div className="bg-gray-100 flex flex-col items-center justify-center min-h-screen px-4">
                <h1 className="text-5xl font-bold text-gray-300 mb-6">tududi</h1>
                <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">
                        {t('auth.loading', 'Loading...')}
                    </p>
                </div>
            </div>
        );
    }

    // If OIDC is enabled and user is being redirected
    if (oidcEnabled && !usePasswordLogin) {
        return (
            <div className="bg-gray-100 flex flex-col items-center justify-center min-h-screen px-4">
                <h1 className="text-5xl font-bold text-gray-300 mb-6">tududi</h1>
                <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 mb-4">
                        {t('auth.redirectingToSSO', 'Redirecting to SSO...')}
                    </p>
                    <a
                        href="/login?password=true"
                        className="text-sm text-blue-500 hover:text-blue-600"
                    >
                        {t('auth.usePasswordInstead', 'Use password login instead')}
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-100 flex flex-col items-center justify-center min-h-screen px-4">
            <h1 className="text-5xl font-bold text-gray-300 mb-6">tududi</h1>
            <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
                {error && (
                    <div className="mb-4 text-center text-red-500">{error}</div>
                )}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label
                            htmlFor="email"
                            className="block text-gray-600 mb-1"
                        >
                            {t('auth.email', 'Email')}
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label
                            htmlFor="password"
                            className="block text-gray-600 mb-1"
                        >
                            {t('auth.password', 'Password')}
                        </label>
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                        {t('auth.login', 'Login')}
                    </button>
                </form>
                {oidcEnabled && usePasswordLogin && (
                    <>
                        <div className="my-4 flex items-center">
                            <div className="flex-grow border-t border-gray-300"></div>
                            <span className="px-4 text-gray-500 text-sm">
                                {t('auth.or', 'OR')}
                            </span>
                            <div className="flex-grow border-t border-gray-300"></div>
                        </div>
                        <button
                            type="button"
                            onClick={handleOidcLogin}
                            className="w-full bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
                        >
                            <svg
                                className="w-5 h-5 mr-2"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            {t('auth.loginWithSSO', 'Login with SSO')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default Login;
