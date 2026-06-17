import React, { useState } from 'react';
import { apiUrl } from '../api';

const SignupPage = ({ onAuthenticated, onShowToast, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!formData.email || !formData.password) {
      onShowToast('Please enter your email and password.', 'error');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(apiUrl('/user/signup'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const responseData = await response.json();
      if (!response.ok || !responseData?.data?.user) {
        onShowToast(responseData.error || responseData.message || 'Signup failed', 'error');
        setLoading(false);
        return;
      }

      const { user, token } = responseData.data;
      onAuthenticated({
        ...user,
        token,
      });
      setLoading(false);
    } catch (error) {
      console.error('Signup page error:', error);
      onShowToast('Network error. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card auth-card-large signup-card">
        <div className="auth-card-header signup-header">
          <span className="auth-badge">Web3 Fintech Onboarding</span>
          <h1>Sign up for DeFiGate</h1>
          <p>Start with a simple account, then unlock wallet access, deposits, and transfers.</p>
        </div>

        <div className="signup-body">
          <section className="signup-panel">
            <div className="signup-highlight">
              <h2>Secure account creation for your DeFi finance flow</h2>
              <p className="signup-copy">
                Sign up with email and password. Your Solana wallet will be created automatically after account creation.
              </p>
              <ul className="signup-benefits">
                <li>Simple signup with email and password</li>
                <li>Solana wallet setup begins automatically after signup</li>
                <li>Please wait a moment while we create your wallet</li>
              </ul>
            </div>
          </section>

          <form className="auth-form signup-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="you@defigate.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="form-row">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Create a strong password"
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary full-width" disabled={loading}>
              {loading ? 'Creating account and wallet...' : 'Create account'}
            </button>
            {loading && (
              <p className="signup-loading-note">Please wait a moment while we create your Solana wallet.</p>
            )}

            <div className="auth-page-footer signup-footer">
              <p>
                Already have an account?{' '}
                <button type="button" className="link-btn" onClick={onCancel}>
                  Sign in instead
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
