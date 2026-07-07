const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const favoritesRoutes = require('./routes/favoritesRoutes');
const agentRoutes = require('./routes/agentRoutes');
const kycRoutes = require('./routes/kycRoutes');
const adminKycRoutes = require('./routes/adminKycRoutes');
const chatRoutes = require('./routes/chatRoutes');
const phoneOtpRoutes = require('./routes/phoneOtpRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const trustScoreRoutes = require('./routes/trustScoreRoutes');
const userProfileRoutes = require('./routes/userProfileRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
app.use('/api', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/admin/kyc', adminKycRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/phone', phoneOtpRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/trust-score', trustScoreRoutes);
app.use('/api/users', userProfileRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

