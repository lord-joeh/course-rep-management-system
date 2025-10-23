module.exports = {
  apps: [
    {
      name: 'main-server',
      script: 'index.js',
      watch: ['.', 'config'],
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'queue-processing-worker',
      script: './services/queueWorker.js',
      exec_mode: 'fork',
      instances: 1,
      watch: false,
        env: {
            NODE_ENV: 'development'
        },
        env_production: {
            NODE_ENV: 'production'
        }
    }
  ],
  deploy: {
    production: {
      user: 'SSH_USERNAME',
      host: 'SSH_HOSTMACHINE',
      ref: 'origin/master',
      repo: 'https://github.com/lord-joeh/course-rep-management-system.git',
      path: 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};