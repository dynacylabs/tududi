import { useState, useEffect } from 'react';

interface OIDCStatus {
    enabled: boolean;
    configured: boolean;
    issuer: string | null;
    loading: boolean;
    error: string | null;
}

/**
 * Custom hook to check OIDC configuration and initiate OIDC login
 * 
 * Example usage:
 * 
 * const { oidcStatus, initiateOIDCLogin } = useOIDC();
 * 
 * if (oidcStatus.enabled && oidcStatus.configured) {
 *   <button onClick={initiateOIDCLogin}>Login with SSO</button>
 * }
 */
export const useOIDC = () => {
    const [oidcStatus, setOIDCStatus] = useState<OIDCStatus>({
        enabled: false,
        configured: false,
        issuer: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        const checkOIDCStatus = async () => {
            try {
                const response = await fetch('/api/oidc/status', {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to check OIDC status');
                }

                const data = await response.json();
                setOIDCStatus({
                    enabled: data.enabled || false,
                    configured: data.configured || false,
                    issuer: data.issuer || null,
                    loading: false,
                    error: null,
                });
            } catch (error) {
                setOIDCStatus({
                    enabled: false,
                    configured: false,
                    issuer: null,
                    loading: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        };

        checkOIDCStatus();
    }, []);

    const initiateOIDCLogin = async () => {
        try {
            const response = await fetch('/api/oidc/login', {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to initiate OIDC login');
            }

            const data = await response.json();
            
            if (data.authUrl) {
                // Redirect to OIDC provider
                window.location.href = data.authUrl;
            } else {
                throw new Error('No authorization URL received');
            }
        } catch (error) {
            console.error('OIDC login error:', error);
            throw error;
        }
    };

    return {
        oidcStatus,
        initiateOIDCLogin,
    };
};
