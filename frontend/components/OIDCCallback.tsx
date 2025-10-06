import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * OIDC Callback Component
 * 
 * This component handles the redirect from the OIDC provider after authentication.
 * Place this component at the /oidc-callback route in your React Router.
 * 
 * Example usage in your router:
 * <Route path="/oidc-callback" element={<OIDCCallback />} />
 */
const OIDCCallback: React.FC = () => {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const success = params.get('success');
        const errorMessage = params.get('error');

        if (success === 'true') {
            // Authentication successful, redirect to dashboard
            navigate('/', { replace: true });
        } else if (errorMessage) {
            // Authentication failed
            setError(decodeURIComponent(errorMessage));
        } else {
            // Invalid callback
            setError('Invalid authentication callback');
        }
    }, [navigate]);

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
                <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
                    <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900 rounded-full">
                        <svg
                            className="w-6 h-6 text-red-600 dark:text-red-400"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-center text-gray-900 dark:text-white">
                        Authentication Failed
                    </h3>
                    <p className="mt-2 text-sm text-center text-gray-600 dark:text-gray-400">
                        {error}
                    </p>
                    <div className="mt-6">
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Back to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
                <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
                <p className="mt-4 text-center text-gray-600 dark:text-gray-400">
                    Completing authentication...
                </p>
            </div>
        </div>
    );
};

export default OIDCCallback;
