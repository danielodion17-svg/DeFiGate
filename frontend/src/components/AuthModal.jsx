import React, { useState } from 'react';
import { apiUrl } from '../api';

const AuthModal = ({ onAuthenticated, onShowToast }) => {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/user/signin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        onShowToast(errorData.error || errorData.message || 'Sign in failed', 'error');
        setLoading(false);
        return;
      }

      const response_data = await response.json();
      if (!response_data?.data?.user) {
        onShowToast('Invalid server response', 'error');
        setLoading(false);
        return;
      }

      const { user, token } = response_data.data;
      onAuthenticated({
        id: user.id,
        name: user.email,
        email: user.email,
        walletAddress: user.walletAddress || null,
        token: token,
      });
      setLoading(false);
    } catch (error) {
      console.error('Sign in error:', error);
      onShowToast('Network error. Please try again.', 'error');
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/user/signup'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        onShowToast(errorData.error || errorData.message || 'Sign up failed', 'error');
        setLoading(false);
        return;
      }

      const response_data = await response.json();
      if (!response_data?.data?.user) {
        onShowToast('Invalid server response', 'error');
        setLoading(false);
        return;
      }

      const { user, token } = response_data.data;
      onAuthenticated({
        id: user.id,
        name: user.email,
        email: user.email,
        walletAddress: user.walletAddress || null,
        token: token,
      });
      setLoading(false);
    } catch (error) {
      console.error('Sign up error:', error);
      onShowToast('Network error. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{isSignUp ? 'Create Account' : 'Sign In'}</h2>
        </div>

        <form onSubmit={isSignUp ? handleSignUp : handleSignIn}>
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="John Doe"
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="modal-footer">
          {isSignUp ? 'Already have an account?' : 'Don\'t have an account?'}
          <button
            className="link-btn"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setFormData({
                email: '',
                password: '',
                name: '',
              });
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
