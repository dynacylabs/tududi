import React, { useState } from 'react';
import { useOIDC } from '../hooks/useOIDC';

/**
 * Example Login Component Enhancement
 * 
 * This shows how to add OIDC login option to your existing login component.
 * Integrate this into your existing Login component.
 */

interface LoginWithOIDCButtonProps {
    className?: string;
}

export const LoginWithOIDCButton: React.FC<LoginWithOIDCButtonProps> = ({ className = '' }) => {
    const { oidcStatus, initiateOIDCLogin } = useOIDC();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleOIDCLogin = async () => {
        setLoading(true);
        setError(null);
        
        try {
            await initiateOIDCLogin();
            // User will be redirected, so we won't reach here
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to login with SSO');
            setLoading(false);
        }
    };

    // Don't show button if OIDC is not enabled or not configured
    if (!oidcStatus.enabled || !oidcStatus.configured || oidcStatus.loading) {
        return null;
    }

    return (
        <div className={className}>
            <button
                type="button"
                onClick={handleOIDCLogin}
                disabled={loading}
                className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <>
                        <svg
                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-700 dark:text-gray-200"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                            ></circle>
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                        </svg>
                        Redirecting...
                    </>
                ) : (
                    <>
                        <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
                        </svg>
                        Login with SSO
                    </>
                )}
            </button>
            
            {error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {error}
                </p>
            )}
        </div>
    );
};

/**
 * Example integration into existing login page:
 * 
 * export const LoginPage: React.FC = () => {
 *     return (
 *         <div className="login-container">
 *             <h1>Login</h1>
 *             
 *             // Your existing email/password form
 *             <form onSubmit={handleLocalLogin}>
 *                 <input type="email" ... />
 *                 <input type="password" ... />
 *                 <button type="submit">Login</button>
 *             </form>
 *             
 *             // Add divider
 *             <div className="relative my-6">
 *                 <div className="absolute inset-0 flex items-center">
 *                     <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
 *                 </div>
 *                 <div className="relative flex justify-center text-sm">
 *                     <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">
 *                         Or continue with
 *                     </span>
 *                 </div>
 *             </div>
 *             
 *             // Add OIDC login button
 *             <LoginWithOIDCButton />
 *         </div>
 *     );
 * };
 */
