-- Add role column to users table for admin authentication
-- Migration: 013_add_user_roles.sql

-- Add role column with allowed values and default
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user' NOT NULL;

-- Add constraint to enforce allowed values
DO $$ BEGIN
    ALTER TABLE users
    ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'support'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create index for efficient role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Comment for clarity
COMMENT ON COLUMN users.role IS 'User role for access control: user, admin, or support';