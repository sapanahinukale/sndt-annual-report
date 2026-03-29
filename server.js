/**
 * SNDT Annual Report — Backend Server
 * Stack: Node.js + Express + MongoDB Atlas (Mongoose)
 * Run:   node server.js
 */

require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');


const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors()); // enable CORS for all routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ─── MongoDB Atlas Connection ────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://Annual_Report:Annual123@cluster0.6maz1te.mongodb.net/sndt_annual_reports';

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected — retrying…'));
mongoose.connection.on('reconnected',  () => console.log('✅  MongoDB reconnected'));

// ─── Schemas ─────────────────────────────────────────────────────
const Mixed = mongoose.Schema.Types.Mixed;

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin', 'department'], default: 'department' },
  deptName: { type: String, default: '' },
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const reportSchema = new mongoose.Schema({
  academicYear: { type: String, required: true },
  submittedBy:  { type: String, default: '' },
  submittedAt:  { type: Date, default: Date.now },
  section1: {
    departmentName:    { type: String, default: '' },
    address:           { type: String, default: '' },
    yearOfEstablishment: { type: String, default: '' },
    hodName:           { type: String, default: '' },
    hodInCharge:       { type: String, default: '' },
    telephone:         { type: String, default: '' },
    fax:               { type: String, default: '' },
    email:             { type: String, default: '' },
    website:           { type: String, default: '' },
    programmes:        [Mixed],
    infrastructure:    [Mixed],
    intakeCapacity:    [Mixed],
  },
  section2:  { categoryAdmission:[Mixed], yearAdmission:[Mixed], scholarships:[Mixed], faculty:[Mixed], guestFaculty:[Mixed], nonTeaching:[Mixed] },
  section3:  { organizedEvents:[Mixed], otherEvents:[Mixed], facultyPapers:[Mixed], facultyWorkshops:[Mixed], facultyDevelopment:[Mixed] },
  section4:  { journalArticles:[Mixed], books:[Mixed], chapters:[Mixed], conferenceProceedings:[Mixed], otherPublications:[Mixed] },
  section5:  { facultyResearch:[Mixed], patents:[Mixed], consultancy:[Mixed], studentResearch:[Mixed], phdStudents:[Mixed], pgDissertation:[Mixed], internships:[Mixed] },
  section6:  { studentAwards:[Mixed], facultyAwards:[Mixed], competitiveExams:[Mixed] },
  section7:  { studyVisits:[Mixed], domesticVisitors:[Mixed], intlVisitors:[Mixed], socialInitiatives:[Mixed], campusPlacement:[Mixed] },
  section8:  { workshops:[Mixed], nssActivities:String, teachingQuality:String, otherActivities:String },
  section9:  { mous:[Mixed], donors:[Mixed], totalCorpus:Number },
  section10: { alumniAssociation:String, deptAlumniAssoc:String, alumniActivities:[Mixed], obituaries:[Mixed], otherInfo:String, hodName:String, hodDate:String, hodSignatureBase64:String },
}, { timestamps: true });

reportSchema.index({ academicYear: 1, 'section1.departmentName': 1 }, { unique: true });
const Report = mongoose.model('Report', reportSchema);

// ─── Seed default admin ───────────────────────────────────────────
mongoose.connection.once('open', async () => {
  try {
    const exists = await User.findOne({ role: 'admin' });
    if (!exists) {
      await User.create({ username: 'xyz', password: 'xyz', role: 'admin', deptName: 'Administration' });
      console.log('✅ Default admin created  →  username: admin  |  password: admin123');
    }
  } catch(e) { /* already seeded */ }
});

// ─── Auth middleware ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split('|');
    req.user = { username: parts[0], role: parts[1], deptName: parts[2] || '' };
    next();
  } catch { res.status(401).json({ success: false, error: 'Invalid token' }); }
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
    next();
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
    const user = await User.findOne({ username: username.trim() });
    if (!user || user.password !== password)
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    const token = Buffer.from(`${user.username}|${user.role}|${user.deptName}`).toString('base64');
    res.json({ success: true, token, role: user.role, username: user.username, deptName: user.deptName });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/me', requireAuth, (req, res) => res.json({ success: true, user: req.user }));

// ─── USERS (admin only) ───────────────────────────────────────────
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, role, deptName } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });
    const user = await User.create({ username: username.trim(), password, role: role || 'department', deptName: deptName || '' });
    res.json({ success: true, user: { _id: user._id, username: user.username, role: user.role, deptName: user.deptName } });
  } catch(err) {
    if (err.code === 11000) return res.status(400).json({ success: false, error: 'Username already exists' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/users/:id/password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, error: 'Password required' });
    await User.findByIdAndUpdate(req.params.id, { password });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─── REPORTS ─────────────────────────────────────────────────────

// Helper: build section1 explicitly from body to ensure it persists correctly
function buildSection1(body) {
  const s1 = body.section1 || {};
  return {
    departmentName:      s1.departmentName      || '',
    address:             s1.address             || '',
    yearOfEstablishment: s1.yearOfEstablishment || '',
    hodName:             s1.hodName             || '',
    hodInCharge:         s1.hodInCharge         || '',
    telephone:           s1.telephone           || '',
    fax:                 s1.fax                 || '',
    email:               s1.email               || '',
    website:             s1.website             || '',
    programmes:          Array.isArray(s1.programmes)     ? s1.programmes     : [],
    infrastructure:      Array.isArray(s1.infrastructure) ? s1.infrastructure : [],
    intakeCapacity:      Array.isArray(s1.intakeCapacity) ? s1.intakeCapacity : [],
  };
}

// Save / upsert report (create or update by year + dept)
async function upsertReport(body, username) {
  const { academicYear } = body;
  if (!academicYear) throw new Error('academicYear is required');

  const section1 = buildSection1(body);
  const deptName = section1.departmentName || '';

  const filter = {
    academicYear,
    'section1.departmentName': deptName,
  };

  const update = {
    $set: {
      academicYear,
      submittedBy: username,
      submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
      section1,
      section2:  body.section2  || {},
      section3:  body.section3  || {},
      section4:  body.section4  || {},
      section5:  body.section5  || {},
      section6:  body.section6  || {},
      section7:  body.section7  || {},
      section8:  body.section8  || {},
      section9:  body.section9  || {},
      section10: body.section10 || {},
    }
  };

  const report = await Report.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    runValidators: false,
  });
  return report;
}

app.post('/api/save-report', requireAuth, async (req, res) => {
  try {
    const report = await upsertReport(req.body, req.user.username);
    res.json({ success: true, message: 'Saved to MongoDB Atlas ✅', id: report._id });
  } catch(err) {
    console.error('save-report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Alias
app.post('/api/submit-report', requireAuth, async (req, res) => {
  try {
    const report = await upsertReport(req.body, req.user.username);
    res.json({ success: true, message: 'Saved to MongoDB Atlas ✅', id: report._id });
  } catch(err) {
    console.error('submit-report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update report by ID (for edit)
app.put('/api/report/:id', requireAuth, async (req, res) => {
  try {
    const existing = await Report.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Report not found' });

    // Department users can only edit their own dept reports
    if (req.user.role === 'department' && req.user.deptName &&
        existing.section1?.departmentName !== req.user.deptName) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const section1 = buildSection1(req.body);
    const update = {
      academicYear:  req.body.academicYear || existing.academicYear,
      submittedBy:   req.user.username,
      submittedAt:   existing.submittedAt, // keep original submission time
      section1,
      section2:  req.body.section2  || existing.section2,
      section3:  req.body.section3  || existing.section3,
      section4:  req.body.section4  || existing.section4,
      section5:  req.body.section5  || existing.section5,
      section6:  req.body.section6  || existing.section6,
      section7:  req.body.section7  || existing.section7,
      section8:  req.body.section8  || existing.section8,
      section9:  req.body.section9  || existing.section9,
      section10: req.body.section10 || existing.section10,
    };

    const report = await Report.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: false });
    res.json({ success: true, message: 'Report updated ✅', id: report._id });
  } catch(err) {
    console.error('update-report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'department' && req.user.deptName)
      filter['section1.departmentName'] = req.user.deptName;
    const reports = await Report.find(filter).sort({ updatedAt: -1 });
    res.json({ success: true, reports });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/reports/stats', requireAdmin, async (req, res) => {
  try {
    const total  = await Report.countDocuments();
    const depts  = await Report.distinct('section1.departmentName');
    const years  = await Report.distinct('academicYear');
    const latest = await Report.findOne({}, { submittedAt: 1 }).sort({ submittedAt: -1 });
    res.json({ success: true, total, departments: depts.length, years: years.length, latestAt: latest?.submittedAt });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/report/:id', requireAuth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
    if (req.user.role === 'department' && req.user.deptName &&
        report.section1?.departmentName !== req.user.deptName)
      return res.status(403).json({ success: false, error: 'Access denied' });
    res.json({ success: true, report });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/report/:id', requireAdmin, async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/health', (_, res) => {
  const state = mongoose.connection.readyState;
  res.json({ status: 'ok', db: state === 1 ? 'connected' : state === 2 ? 'connecting' : 'disconnected' });
});

// ─── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Server → http://localhost:${PORT}`);
  console.log(`    Login  → http://localhost:${PORT}/login.html\n`);
});
