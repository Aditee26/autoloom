process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_value_for_jest_only';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test_encryption_key_0123456789abcdef';
process.env.SCHEDULER_ENABLED = 'false';
