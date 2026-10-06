const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { getDepartmentModel, DEPARTMENT_ALIAS_MAP, DEPARTMENTS } = require('./models/DepartmentStrength');
const { getFacultyModel, FACULTY_DB_NAME } = require('./models/DepartmentFaculty');
const { getGOModel, GO_DB_NAME } = require('./models/DepartmentGO');
const { getOIModel, OI_DB_NAME } = require('./models/DepartmentOI');
const { getPublicationModel, PUB_DB_NAME } = require('./models/DepartmentPublication');
const { getPatentModel, PATENT_DB_NAME } = require('./models/DepartmentPatent');
const { getConsultancyModel, CONSULTANCY_DB_NAME } = require('./models/DepartmentConsultancy');
const { getProjectFundingModel, PROJECT_FUNDING_DB_NAME } = require('./models/DepartmentProjectFunding');
const { getExpenditureModel, EXPENDITURE_DB_NAME } = require('./models/DepartmentExpenditure');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all origins (supports file://, live-server, localhost ports)
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files (root directory containing index.html)
app.use(express.static(path.join(__dirname, '..')));

// Connect to MongoDB databases
connectDB();

/**
 * Helper function: Validate Indian PAN Number format
 * Standard PAN format: 5 letters, 4 numbers, 1 letter (10 chars, uppercase alphanumeric)
 */
function isValidPAN(pan) {
  if (!pan || typeof pan !== 'string') return false;
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.trim().toUpperCase());
}

/**
 * ══════════════════════════════════════════════════
 * FACULTY DATA API ROUTES (Database: faculty_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/faculty/:deptId
 * Fetch all faculty records from the respective department table in 'faculty_data' database
 */
app.get('/api/faculty/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getFacultyModel(collectionName);
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1, createdAt: 1 });

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: FACULTY_DB_NAME,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching faculty for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty records from MongoDB',
      error: error.message
    });
  }
});

/**
 * GET /api/faculty/:deptId/pan/:panNo
 * Fetch a single faculty record by PAN number
 */
app.get('/api/faculty/:deptId/pan/:panNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const panNo = String(req.params.panNo || '').trim().toUpperCase();
    if (!isValidPAN(panNo)) {
      return res.status(400).json({ success: false, message: `Invalid PAN Number format: "${panNo}". PAN must be 10 alphanumeric characters (e.g. ABCDE1234F).` });
    }

    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getFacultyModel(collectionName);

    const doc = await Model.findOne({ pan_no: panNo }, { _id: 0 });
    if (!doc) {
      return res.status(404).json({ success: false, message: `Faculty with PAN "${panNo}" not found` });
    }

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      data: doc
    });
  } catch (error) {
    console.error(`Error fetching faculty by PAN for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch faculty record by PAN from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/faculty/:deptId
 * Store/Override faculty records in the respective department table with PAN validation and uniqueness checks
 */
app.post('/api/faculty/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getFacultyModel(collectionName);

    const { faculty, replaceAll } = req.body;
    if (!Array.isArray(faculty)) {
      return res.status(400).json({ success: false, message: 'Invalid payload: faculty array required' });
    }

    // Validate PAN number formats and payload internal uniqueness
    const panSet = new Set();
    for (let i = 0; i < faculty.length; i++) {
      const f = faculty[i];
      if (!f.name) continue;
      const pan = String(f.pan_no || f.pan || f['PAN Number'] || f['PAN'] || '').trim().toUpperCase();
      if (pan) {
        if (!isValidPAN(pan)) {
          return res.status(400).json({
            success: false,
            message: `Invalid PAN Number format on record #${i + 1} ("${pan}"). PAN must be 10 characters (5 letters, 4 digits, 1 letter, e.g. ABCDE1234F).`
          });
        }
        if (panSet.has(pan)) {
          return res.status(400).json({
            success: false,
            message: `Duplicate PAN Number "${pan}" found in upload payload. PAN number must be unique.`
          });
        }
        panSet.add(pan);
      }
    }

    if (replaceAll) {
      await Model.deleteMany({});
    }

    const inserted = [];
    for (let i = 0; i < faculty.length; i++) {
      const f = faculty[i];
      if (!f.name) continue;
      const pan = String(f.pan_no || f.pan || f['PAN Number'] || f['PAN'] || '').trim().toUpperCase();

      // If not replaceAll, check DB for existing duplicate PAN
      if (!replaceAll && pan) {
        const existing = await Model.findOne({ pan_no: pan });
        if (existing) {
          return res.status(400).json({
            success: false,
            message: `Faculty record with PAN Number "${pan}" already exists in table "${collectionName}". Duplicate PAN numbers are not allowed.`
          });
        }
      }

      const doc = await Model.create({
        sl_no: f.sl_no !== undefined ? Number(f.sl_no) : (i + 1),
        name: String(f.name).trim(),
        pan_no: pan,
        age: f.age ? Number(f.age) : null,
        designation: f.designation ? String(f.designation).trim() : '',
        gender: f.gender ? String(f.gender).trim().toUpperCase() : '',
        qualification: f.qualification ? String(f.qualification).trim().toUpperCase() : '',
        experience: f.experience !== undefined ? Number(f.experience) : 0,
        currently_working: f.currently_working ? String(f.currently_working).trim() : 'Yes',
        joining_date: f.joining_date ? String(f.joining_date).trim() : null,
        leaving_date: f.leaving_date ? String(f.leaving_date).trim() : null,
        association_type: f.association_type ? String(f.association_type).trim() : 'Regular',
        status: f.status || ((String(f.currently_working).toLowerCase() === 'no' || f.leaving_date) ? 'left' : 'active'),
        department: rawDeptId
      });
      inserted.push(doc);
    }

    return res.json({
      success: true,
      message: `Successfully stored ${inserted.length} faculty records in department table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: FACULTY_DB_NAME,
      savedCount: inserted.length
    });
  } catch (error) {
    console.error(`Error saving faculty for ${req.params.deptId}:`, error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate PAN Number error: A faculty record with this PAN Number already exists in database.',
        error: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to save faculty records to MongoDB: ' + error.message,
      error: error.message
    });
  }
});

/**
 * DELETE /api/faculty/:deptId/pan/:panNo
 * Delete a faculty record by PAN number
 */
app.delete('/api/faculty/:deptId/pan/:panNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const panNo = String(req.params.panNo || '').trim().toUpperCase();
    if (!isValidPAN(panNo)) {
      return res.status(400).json({ success: false, message: `Invalid PAN Number format: "${panNo}".` });
    }

    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getFacultyModel(collectionName);

    const result = await Model.deleteOne({ pan_no: panNo });
    return res.json({
      success: true,
      message: `Deleted faculty record with PAN "${panNo}" from table "${collectionName}"`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error(`Error deleting faculty by PAN for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete faculty record from MongoDB',
      error: error.message
    });
  }
});

/**
 * DELETE /api/faculty/:deptId
 * Clear all faculty records for a specific department
 */
app.delete('/api/faculty/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getFacultyModel(collectionName);

    const result = await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared ${result.deletedCount} faculty records from table "${collectionName}"`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error(`Error deleting faculty for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear faculty records from MongoDB',
      error: error.message
    });
  }
});

/**
 * PATCH /api/faculty/:deptId/status
 * Update currently_working status and leaving_date for a specific faculty member (using pan_no, sl_no, or name)
 */
app.patch('/api/faculty/:deptId/status', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getFacultyModel(collectionName);

    const { pan_no, name, sl_no, currently_working, leaving_date, status } = req.body;
    if (!pan_no && !name && sl_no === undefined) {
      return res.status(400).json({ success: false, message: 'Faculty PAN number, name or sl_no required' });
    }

    const query = {};
    if (pan_no) query.pan_no = String(pan_no).trim().toUpperCase();
    else if (sl_no !== undefined && !isNaN(Number(sl_no))) query.sl_no = Number(sl_no);
    else if (name) query.name = new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const updateData = {
      currently_working: currently_working || 'No',
      leaving_date: leaving_date || null,
      status: status || (String(currently_working).toLowerCase() === 'no' || leaving_date ? 'left' : 'active')
    };

    let doc = await Model.findOneAndUpdate(query, updateData, { new: true });
    if (!doc && name) {
      doc = await Model.findOneAndUpdate({ name: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, updateData, { new: true });
    }

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Faculty record not found' });
    }

    return res.json({
      success: true,
      message: `Updated faculty status for ${doc.name}`,
      data: doc
    });
  } catch (error) {
    console.error(`Error updating faculty status for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update faculty status in MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/student-strength/etl-pipeline
 * Validate and override data into respective department tables from Excel ETL pipeline
 * (Placed before /:deptId to avoid route collision)
 */
app.post('/api/student-strength/etl-pipeline', async (req, res) => {
  try {
    const { rows, defaultDeptId } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid excel format: No data rows found' });
    }

    const groupedByDept = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawDept = (row.DEPARTMENT || defaultDeptId || '').trim().toUpperCase();
      const deptId = DEPARTMENT_ALIAS_MAP[rawDept] || rawDept;

      if (!deptId) {
        return res.status(400).json({
          success: false,
          message: `Invalid excel format: Missing department on row ${i + 1}`
        });
      }

      const yr = String(row.YEAR || '').trim();
      const nt = Number(row.NT);
      const ne = Number(row.NE);
      const np = Number(row.NP || 0);

      if (!yr || isNaN(nt) || isNaN(ne) || isNaN(np) || !Number.isInteger(nt) || !Number.isInteger(ne) || !Number.isInteger(np) || nt < 0 || ne < 0 || np < 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid excel format: Invalid values on row ${i + 1}`
        });
      }

      if (!groupedByDept[deptId]) groupedByDept[deptId] = [];
      groupedByDept[deptId].push({ YEAR: yr, NT: nt, NE: ne, NP: np, DEPARTMENT: rawDept });
    }

    const results = {};
    for (const [deptId, records] of Object.entries(groupedByDept)) {
      const Model = getDepartmentModel(deptId);
      let count = 0;
      for (const rec of records) {
        await Model.findOneAndUpdate(
          { YEAR: rec.YEAR },
          {
            DEPARTMENT: rec.DEPARTMENT || deptId,
            YEAR: rec.YEAR,
            NT: rec.NT,
            NE: rec.NE,
            NP: rec.NP
          },
          { upsert: true, new: true, runValidators: true }
        );
        count++;
      }
      results[deptId] = count;
    }

    return res.json({
      success: true,
      message: 'ETL Pipeline successfully processed and updated database tables',
      totalRows: rows.length,
      departmentsUpdated: Object.keys(results),
      details: results
    });
  } catch (error) {
    console.error('ETL pipeline processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Invalid excel format or database error: ' + error.message
    });
  }
});

/**
 * GET /api/student-strength/:deptId
 * Fetch student strength records (YEAR, NT, NE, NP) for a specific department
 */
app.get('/api/student-strength/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getDepartmentModel(collectionName);
    const records = await Model.find({}, { _id: 0, YEAR: 1, NT: 1, NE: 1, NP: 1, DEPARTMENT: 1 }).sort({ YEAR: -1 });

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching student strength for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch student strength data from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/student-strength/:deptId
 * Update or save student strength records for a specific department
 */
app.post('/api/student-strength/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getDepartmentModel(collectionName);

    const { records } = req.body; // Array of { YEAR, NT, NE, NP }
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload: records array required' });
    }

    const updated = [];
    for (const item of records) {
      if (!item.YEAR) continue;
      const doc = await Model.findOneAndUpdate(
        { YEAR: item.YEAR },
        {
          DEPARTMENT: rawDeptId,
          YEAR: item.YEAR,
          NT: Number(item.NT || 0),
          NE: Number(item.NE || 0),
          NP: Number(item.NP || 0)
        },
        { upsert: true, new: true, runValidators: true }
      );
      updated.push(doc);
    }

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      updatedCount: updated.length
    });
  } catch (error) {
    console.error(`Error saving student strength for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save student strength data to MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * GO DATA API ROUTES (Database: go_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/go/:deptId
 * Fetch graduation outcome (GO) data for a specific department from 'go_data' database
 */
app.get('/api/go/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getGOModel(collectionName);
    let record = await Model.findOne({ department: collectionName }, { _id: 0 });
    if (!record) {
      record = await Model.findOne({}, { _id: 0 });
    }

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: GO_DB_NAME,
      data: record
    });
  } catch (error) {
    console.error(`Error fetching GO data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch GO data from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/go/:deptId
 * Save or update graduation outcome (GO) data for a specific department in 'go_data' database
 */
app.post('/api/go/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getGOModel(collectionName);

    const { ug, pg, phd_full, phd_part } = req.body;

    const updateData = {
      department: collectionName,
      ug: Array.isArray(ug) ? ug.map(r => ({
        intakeYr: String(r.intakeYr || '').trim(),
        lateralYr: String(r.lateralYr || '').trim(),
        year: String(r.year || '').trim(),
        intake: Number(r.intake || 0),
        admitted: Number(r.admitted || 0),
        lateral: Number(r.lateral || 0),
        graduated: Number(r.graduated || 0),
        placed: Number(r.placed || 0),
        medSalary: Number(r.medSalary || 0),
        higher: Number(r.higher || 0)
      })) : [],
      pg: Array.isArray(pg) ? pg.map(r => ({
        year: String(r.year || '').trim(),
        intake: Number(r.intake || 0),
        admitted: Number(r.admitted || 0),
        graduated: Number(r.graduated || 0),
        placed: Number(r.placed || 0),
        medSalary: Number(r.medSalary || 0),
        higher: Number(r.higher || 0)
      })) : [],
      phd_full: Number(phd_full || 0),
      phd_part: Number(phd_part || 0)
    };

    const doc = await Model.findOneAndUpdate(
      { department: collectionName },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: `Successfully saved GO data for department "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: GO_DB_NAME,
      data: doc
    });
  } catch (error) {
    console.error(`Error saving GO data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save GO data to MongoDB',
      error: error.message
    });
  }
});

/**
 * DELETE /api/go/:deptId
 * Clear or reset GO data for a specific department
 */
app.delete('/api/go/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getGOModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared GO data for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing GO data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear GO data from MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * EXPENDITURE DATA API ROUTES (Database: expenditure_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/expenditure/:deptId
 * Fetch Expenditure data for a specific department from 'expenditure_data' database
 */
app.get('/api/expenditure/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getExpenditureModel(collectionName);
    let record = await Model.findOne({ department: collectionName }, { _id: 0 });
    if (!record) {
      record = await Model.findOne({}, { _id: 0 });
    }

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: EXPENDITURE_DB_NAME,
      data: record
    });
  } catch (error) {
    console.error(`Error fetching Expenditure data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Expenditure data from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/expenditure/:deptId
 * Save or update Expenditure data for a specific department in 'expenditure_data' database
 */
app.post('/api/expenditure/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getExpenditureModel(collectionName);

    const { capex, opex } = req.body;

    const updateData = {
      department: collectionName,
      capex: capex || {},
      opex: opex || {}
    };

    const doc = await Model.findOneAndUpdate(
      { department: collectionName },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: `Successfully saved Expenditure data for department "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: EXPENDITURE_DB_NAME,
      data: doc
    });
  } catch (error) {
    console.error(`Error saving Expenditure data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Expenditure data to MongoDB',
      error: error.message
    });
  }
});

/**
 * DELETE /api/expenditure/:deptId
 * Clear or reset Expenditure data for a specific department
 */
app.delete('/api/expenditure/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getExpenditureModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared Expenditure data for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing Expenditure data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear Expenditure data from MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * OI DATA API ROUTES (Database: oi_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/oi/:deptId
 * Fetch Outreach & Inclusivity (OI) data for a specific department from 'oi_data' database
 */
app.get('/api/oi/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getOIModel(collectionName);
    let record = await Model.findOne({ department: collectionName }, { _id: 0 });
    if (!record) {
      record = await Model.findOne({}, { _id: 0 });
    }

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: OI_DB_NAME,
      data: record
    });
  } catch (error) {
    console.error(`Error fetching OI data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch OI data from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/oi/:deptId
 * Save or update Outreach & Inclusivity (OI) UG (4-Year Program) data for a specific department in 'oi_data' database
 */
app.post('/api/oi/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getOIModel(collectionName);

    const { ug4, pcs_score } = req.body;

    const updateData = {
      department: collectionName,
      ug4: {
        program: 'UG (4-Year Program)',
        ts: Number(ug4?.ts || 0),
        male: Number(ug4?.male || 0),
        female: Number(ug4?.female || 0),
        os: Number(ug4?.os || 0),
        oc: Number(ug4?.oc || 0),
        ews: Number(ug4?.ews || 0),
        sc_st_obc: Number(ug4?.sc_st_obc || 0),
        govt_sch: Number(ug4?.govt_sch || 0),
        inst_sch: Number(ug4?.inst_sch || 0),
        priv_sch: Number(ug4?.priv_sch || 0)
      },
      pcs_score: Number(pcs_score !== undefined ? pcs_score : 20)
    };

    const doc = await Model.findOneAndUpdate(
      { department: collectionName },
      updateData,
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({
      success: true,
      message: `Successfully saved OI data for department "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: OI_DB_NAME,
      data: doc
    });
  } catch (error) {
    console.error(`Error saving OI data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save OI data to MongoDB',
      error: error.message
    });
  }
});

/**
 * DELETE /api/oi/:deptId
 * Clear or reset OI data for a specific department in 'oi_data'
 */
app.delete('/api/oi/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getOIModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared OI data for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing OI data for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear OI data from MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * PUBLICATION DATA API ROUTES (Database: publication_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/publications/:deptId
 * Fetch all publication records for a department from 'publication_data'
 */
app.get('/api/publications/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getPublicationModel(collectionName);
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1, createdAt: 1 });

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: PUB_DB_NAME,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching publications for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch publications from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/publications/:deptId
 * Save / replace the entire publication list for a department in 'publication_data'
 */
app.post('/api/publications/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPublicationModel(collectionName);

    const publications = Array.isArray(req.body.publications) ? req.body.publications : (Array.isArray(req.body) ? req.body : []);

    const cleaned = publications.map((p, idx) => ({
      department: collectionName,
      sl_no: Number(p.sl_no) || (idx + 1),
      faculty_name: String(p.faculty_name || '').trim(),
      title: String(p.title || '').trim(),
      authors: String(p.authors || '').trim(),
      claimed_by: String(p.claimed_by || '').trim(),
      indexing: String(p.indexing || 'Scopus').trim(),
      quartile: String(p.quartile || 'Q2').trim(),
      pub_month: String(p.pub_month || '').trim(),
      journal_name: String(p.journal_name || '').trim(),
      doi: String(p.doi || '').trim()
    }));

    await Model.deleteMany({});
    if (cleaned.length > 0) {
      await Model.insertMany(cleaned);
    }

    const saved = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `Successfully saved ${saved.length} publications for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: PUB_DB_NAME,
      count: saved.length,
      data: saved
    });
  } catch (error) {
    console.error(`Error saving publications for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save publications to MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/publications/:deptId/row
 * Add or update a single publication row
 */
app.post('/api/publications/:deptId/row', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPublicationModel(collectionName);

    const p = req.body;
    const slNo = Number(p.sl_no);
    if (!p.faculty_name || !p.title) {
      return res.status(400).json({ success: false, message: 'Faculty Name and Paper Title are required' });
    }

    const rowData = {
      department: collectionName,
      sl_no: slNo || (await Model.countDocuments() + 1),
      faculty_name: String(p.faculty_name || '').trim(),
      title: String(p.title || '').trim(),
      authors: String(p.authors || '').trim(),
      claimed_by: String(p.claimed_by || '').trim(),
      indexing: String(p.indexing || 'Scopus').trim(),
      quartile: String(p.quartile || 'Q2').trim(),
      pub_month: String(p.pub_month || '').trim(),
      journal_name: String(p.journal_name || '').trim(),
      doi: String(p.doi || '').trim()
    };

    if (slNo) {
      await Model.findOneAndUpdate({ sl_no: slNo }, rowData, { upsert: true, new: true });
    } else {
      await Model.create(rowData);
    }

    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: 'Publication saved successfully',
      data: records
    });
  } catch (error) {
    console.error(`Error saving publication row for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save publication row',
      error: error.message
    });
  }
});

/**
 * DELETE /api/publications/:deptId/row/:slNo
 * Delete a single publication by sl_no
 */
app.delete('/api/publications/:deptId/row/:slNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const slNo = Number(req.params.slNo);
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPublicationModel(collectionName);

    await Model.deleteOne({ sl_no: slNo });
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: `Deleted publication #${slNo}`,
      data: records
    });
  } catch (error) {
    console.error(`Error deleting publication for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete publication',
      error: error.message
    });
  }
});

/**
 * POST /api/publications/:deptId/etl-pipeline
 * Upload and process Excel rows for publication data
 */
app.post('/api/publications/:deptId/etl-pipeline', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPublicationModel(collectionName);

    const { rows, mode } = req.body; // mode: 'replace' (default) or 'append'
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows provided in Excel payload' });
    }

    const cleaned = rows.map((r, idx) => ({
      department: collectionName,
      sl_no: Number(r.sl_no || r.slNo || r['Sl.No.'] || r['Sl. No.'] || r['SL.NO.']) || (idx + 1),
      faculty_name: String(r.faculty_name || r.name || r['Name of the Faculty'] || r['Faculty Name'] || '').trim(),
      title: String(r.title || r['Paper Title'] || r['Title'] || '').trim(),
      authors: String(r.authors || r['List of Authors'] || r['Authors'] || '').trim(),
      claimed_by: String(r.claimed_by || r['Claim by Faculty (Name)'] || r['Claimed By'] || r['Claim by Faculty'] || '').trim(),
      indexing: String(r.indexing || r['Indexing (Scopus/WoS)'] || r['Indexing'] || 'Scopus').trim(),
      quartile: String(r.quartile || r['Quartile (Q1/Q2/Q3/Q4)'] || r['Quartile'] || 'Q2').trim().toUpperCase(),
      pub_month: String(r.pub_month || r['Publication Month (MonYYYY)'] || r['Publication Month'] || r['Month'] || '').trim(),
      journal_name: String(r.journal_name || r['Journal Name/Conference Name'] || r['Journal Name'] || r['Conference Name'] || '').trim(),
      doi: String(r.doi || r['DOI as link'] || r['DOI'] || '').trim()
    })).filter(r => r.faculty_name || r.title);

    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid publication rows found (Faculty Name or Title missing)' });
    }

    if (mode !== 'append') {
      await Model.deleteMany({});
    }
    await Model.insertMany(cleaned);

    const allRecords = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `ETL Pipeline successfully processed and saved ${cleaned.length} publications to table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: PUB_DB_NAME,
      importedCount: cleaned.length,
      totalCount: allRecords.length,
      data: allRecords
    });
  } catch (error) {
    console.error(`Error in publication ETL pipeline for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process publication ETL pipeline: ' + error.message
    });
  }
});

/**
 * DELETE /api/publications/:deptId
 * Clear all publication records for a department
 */
app.delete('/api/publications/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPublicationModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared all publications for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing publications for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear publications from MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * IPR & PATENT DATA API ROUTES (Database: patent_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/patents/:deptId
 * Fetch all patent records for a department from 'patent_data' database
 */
app.get('/api/patents/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getPatentModel(collectionName);
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1, createdAt: 1 });

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: PATENT_DB_NAME,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching patents for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch patents from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/patents/:deptId
 * Save / replace the entire patent list for a department in 'patent_data'
 */
app.post('/api/patents/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPatentModel(collectionName);

    const patents = Array.isArray(req.body.patents) ? req.body.patents : (Array.isArray(req.body) ? req.body : []);

    const cleaned = patents.map((p, idx) => {
      let pubMonth = String(p.pub_month || '').trim();
      const pubGrantedDate = String(p.pub_granted_date || '').trim();
      if (!pubMonth && pubGrantedDate) {
        const parts = pubGrantedDate.split(/[\/\-\.]/);
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          const months = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
          const year = parts[2].length === 2 ? ('20' + parts[2]) : parts[2];
          if (mIdx >= 0 && mIdx < 12 && year) {
            pubMonth = `${months[mIdx]} ${year}`;
          }
        }
      }

      return {
        department: collectionName,
        sl_no: Number(p.sl_no) || (idx + 1),
        app_no: String(p.app_no || '').trim(),
        status: (String(p.status || '').toLowerCase().includes('grant')) ? 'Granted' : 'Published',
        inventor_name: String(p.inventor_name || '').trim(),
        title: String(p.title || '').trim(),
        applicant_name: String(p.applicant_name || 'Dayananda Sagar Academy of Technology and Management').trim(),
        filed_date: String(p.filed_date || '').trim(),
        pub_granted_date: pubGrantedDate,
        pub_granted_no: String(p.pub_granted_no || '').trim(),
        assignee_name: String(p.assignee_name || 'Dayananda Sagar Academy of Technology and Management, Bangalore').trim(),
        source_proof: String(p.source_proof || '').trim(),
        pub_month: pubMonth
      };
    });

    await Model.deleteMany({});
    if (cleaned.length > 0) {
      await Model.insertMany(cleaned);
    }

    const saved = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `Successfully saved ${saved.length} patents for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: PATENT_DB_NAME,
      count: saved.length,
      data: saved
    });
  } catch (error) {
    console.error(`Error saving patents for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save patents to MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/patents/:deptId/row
 * Add or update a single patent row
 */
app.post('/api/patents/:deptId/row', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPatentModel(collectionName);

    const p = req.body;
    const slNo = Number(p.sl_no);
    if (!p.title && !p.app_no) {
      return res.status(400).json({ success: false, message: 'Patent Title or Application Number is required' });
    }

    let pubMonth = String(p.pub_month || '').trim();
    const pubGrantedDate = String(p.pub_granted_date || '').trim();
    if (!pubMonth && pubGrantedDate) {
      const parts = pubGrantedDate.split(/[\/\-\.]/);
      if (parts.length === 3) {
        const mIdx = parseInt(parts[1], 10) - 1;
        const months = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
        const year = parts[2].length === 2 ? ('20' + parts[2]) : parts[2];
        if (mIdx >= 0 && mIdx < 12 && year) {
          pubMonth = `${months[mIdx]} ${year}`;
        }
      }
    }

    const rowData = {
      department: collectionName,
      sl_no: slNo || (await Model.countDocuments() + 1),
      app_no: String(p.app_no || '').trim(),
      status: (String(p.status || '').toLowerCase().includes('grant')) ? 'Granted' : 'Published',
      inventor_name: String(p.inventor_name || '').trim(),
      title: String(p.title || '').trim(),
      applicant_name: String(p.applicant_name || 'Dayananda Sagar Academy of Technology and Management').trim(),
      filed_date: String(p.filed_date || '').trim(),
      pub_granted_date: pubGrantedDate,
      pub_granted_no: String(p.pub_granted_no || '').trim(),
      assignee_name: String(p.assignee_name || 'Dayananda Sagar Academy of Technology and Management, Bangalore').trim(),
      source_proof: String(p.source_proof || '').trim(),
      pub_month: pubMonth
    };

    if (slNo) {
      await Model.findOneAndUpdate({ sl_no: slNo }, rowData, { upsert: true, new: true });
    } else {
      await Model.create(rowData);
    }

    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: 'Patent record saved successfully',
      data: records
    });
  } catch (error) {
    console.error(`Error saving patent row for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save patent row',
      error: error.message
    });
  }
});

/**
 * DELETE /api/patents/:deptId/row/:slNo
 * Delete a single patent by sl_no
 */
app.delete('/api/patents/:deptId/row/:slNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const slNo = Number(req.params.slNo);
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPatentModel(collectionName);

    await Model.deleteOne({ sl_no: slNo });
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: `Deleted patent #${slNo}`,
      data: records
    });
  } catch (error) {
    console.error(`Error deleting patent for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete patent',
      error: error.message
    });
  }
});

/**
 * POST /api/patents/:deptId/etl-pipeline
 * Upload and process Excel rows for patent data
 */
app.post('/api/patents/:deptId/etl-pipeline', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPatentModel(collectionName);

    const { rows, mode } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows provided in Excel payload' });
    }

    const cleaned = rows.map((r, idx) => {
      const sl = Number(r.sl_no || r.slNo || r['Sl. No.'] || r['Sl.No.'] || r['SL.NO.'] || r['Sl No']) || (idx + 1);
      const appNo = String(r.app_no || r['Patent Application No.'] || r['Application No'] || r['Application No.'] || r['Patent Application No'] || '').trim();
      const statusRaw = String(r.status || r['Status of Patent (Published / Granted)'] || r['Status'] || r['Patent Status'] || 'Published').trim();
      const status = statusRaw.toLowerCase().includes('grant') ? 'Granted' : 'Published';
      const inv = String(r.inventor_name || r['Inventor/s Name'] || r['Inventor Name'] || r['Inventors'] || r['Inventor'] || '').trim();
      const title = String(r.title || r['Title of the Patent'] || r['Patent Title'] || r['Title'] || '').trim();
      const applicant = String(r.applicant_name || r['Applicant/s Name'] || r['Applicant Name'] || r['Applicant'] || 'Dayananda Sagar Academy of Technology and Management').trim();
      const filedDate = String(r.filed_date || r['Patent Filed Date (DD/MM/YYYY)'] || r['Patent Filed Date'] || r['Filed Date'] || '').trim();
      const pubGrantedDate = String(r.pub_granted_date || r['Patent Published Date / Granted Date (DD/MM/YYYY)'] || r['Patent Published Date / Granted Date'] || r['Published Date'] || r['Granted Date'] || '').trim();
      const pubGrantedNo = String(r.pub_granted_no || r['Patent Publication Number / Patent Granted Number'] || r['Publication Number'] || r['Granted Number'] || r['Patent No'] || '').trim();
      const assignee = String(r.assignee_name || r['Assignee/s Name (Institute Affiliation/s at time of Appication)'] || r['Assignee/s Name'] || r['Assignee Name'] || r['Assignee'] || 'Dayananda Sagar Academy of Technology and Management, Bangalore').trim();
      const proof = String(r.source_proof || r['Here, attach Source Proof Screenshots/URL/ Website Links, etc.'] || r['Source Proof'] || r['Proof'] || r['URL'] || '').trim();

      let pubMonth = String(r.pub_month || r['Month'] || '').trim();
      if (!pubMonth && pubGrantedDate) {
        const parts = pubGrantedDate.split(/[\/\-\.]/);
        if (parts.length === 3) {
          const mIdx = parseInt(parts[1], 10) - 1;
          const months = ['Jan', 'Feb', 'March', 'April', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
          const year = parts[2].length === 2 ? ('20' + parts[2]) : parts[2];
          if (mIdx >= 0 && mIdx < 12 && year) {
            pubMonth = `${months[mIdx]} ${year}`;
          }
        }
      }

      return {
        department: collectionName,
        sl_no: sl,
        app_no: appNo,
        status: status,
        inventor_name: inv,
        title: title,
        applicant_name: applicant,
        filed_date: filedDate,
        pub_granted_date: pubGrantedDate,
        pub_granted_no: pubGrantedNo,
        assignee_name: assignee,
        source_proof: proof,
        pub_month: pubMonth
      };
    }).filter(r => r.title || r.app_no || r.inventor_name);

    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid patent rows found in Excel sheet' });
    }

    if (mode !== 'append') {
      await Model.deleteMany({});
    }
    await Model.insertMany(cleaned);

    const allRecords = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `ETL Pipeline successfully processed and saved ${cleaned.length} patent records to table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: PATENT_DB_NAME,
      importedCount: cleaned.length,
      totalCount: allRecords.length,
      data: allRecords
    });
  } catch (error) {
    console.error(`Error in patent ETL pipeline for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process patent ETL pipeline: ' + error.message
    });
  }
});

/**
 * DELETE /api/patents/:deptId
 * Clear all patent records for a department
 */
app.delete('/api/patents/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getPatentModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared all patent records for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing patents for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear patent records from MongoDB',
      error: error.message
    });
  }
});

/**
 * ══════════════════════════════════════════════════
 * CONSULTANCY DATA API ROUTES (Database: consultancy_data)
 * ══════════════════════════════════════════════════
 */

/**
 * GET /api/consultancy/:deptId
 * Fetch all consultancy records for a department from 'consultancy_data' database
 */
app.get('/api/consultancy/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

    const Model = getConsultancyModel(collectionName);
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1, createdAt: 1 });

    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: CONSULTANCY_DB_NAME,
      count: records.length,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching consultancy for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch consultancy records from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/consultancy/:deptId
 * Save / replace the entire consultancy list for a department in 'consultancy_data'
 */
app.post('/api/consultancy/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getConsultancyModel(collectionName);

    const records = Array.isArray(req.body.records) ? req.body.records : (Array.isArray(req.body) ? req.body : []);

    const cleaned = records.map((r, idx) => ({
      department: collectionName,
      sl_no: Number(r.sl_no) || (idx + 1),
      faculty_name: String(r.faculty_name || '').trim(),
      funding_agency: String(r.funding_agency || '').trim(),
      amount_received: Number(r.amount_received || 0),
      project_title: String(r.project_title || '').trim(),
      month_year: String(r.month_year || '').trim(),
      total_projects: Number(r.total_projects || 0),
      total_client_orgs: Number(r.total_client_orgs || 0),
      proof_document: String(r.proof_document || '').trim()
    }));

    await Model.deleteMany({});
    if (cleaned.length > 0) {
      await Model.insertMany(cleaned);
    }

    const saved = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `Successfully saved ${saved.length} consultancy records for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: CONSULTANCY_DB_NAME,
      count: saved.length,
      data: saved
    });
  } catch (error) {
    console.error(`Error saving consultancy for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save consultancy records to MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/consultancy/:deptId/row
 * Add or update a single consultancy row
 */
app.post('/api/consultancy/:deptId/row', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getConsultancyModel(collectionName);

    const r = req.body;
    const slNo = Number(r.sl_no);
    if (!r.faculty_name) {
      return res.status(400).json({ success: false, message: 'Faculty Name is required' });
    }

    const rowData = {
      department: collectionName,
      sl_no: slNo || (await Model.countDocuments() + 1),
      faculty_name: String(r.faculty_name || '').trim(),
      funding_agency: String(r.funding_agency || '').trim(),
      amount_received: Number(r.amount_received || 0),
      project_title: String(r.project_title || '').trim(),
      month_year: String(r.month_year || '').trim(),
      total_projects: Number(r.total_projects || 0),
      total_client_orgs: Number(r.total_client_orgs || 0),
      proof_document: String(r.proof_document || '').trim()
    };

    if (slNo) {
      await Model.findOneAndUpdate({ sl_no: slNo }, rowData, { upsert: true, new: true });
    } else {
      await Model.create(rowData);
    }

    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: 'Consultancy record saved successfully',
      data: records
    });
  } catch (error) {
    console.error(`Error saving consultancy row for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save consultancy row',
      error: error.message
    });
  }
});

/**
 * DELETE /api/consultancy/:deptId/row/:slNo
 * Delete a single consultancy record by sl_no
 */
app.delete('/api/consultancy/:deptId/row/:slNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const slNo = Number(req.params.slNo);
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getConsultancyModel(collectionName);

    await Model.deleteOne({ sl_no: slNo });
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: `Deleted consultancy record #${slNo}`,
      data: records
    });
  } catch (error) {
    console.error(`Error deleting consultancy for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete consultancy record',
      error: error.message
    });
  }
});

/**
 * POST /api/consultancy/:deptId/etl-pipeline
 * Upload and process Excel rows for consultancy data (ETL)
 */
app.post('/api/consultancy/:deptId/etl-pipeline', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getConsultancyModel(collectionName);

    const { rows, mode } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows provided in Excel payload' });
    }

    const cleaned = rows.map((r, idx) => ({
      department: collectionName,
      sl_no: Number(r.sl_no || r['Sl.No.'] || r['Sl. No.'] || r['SL.NO.'] || r['Sl No']) || (idx + 1),
      faculty_name: String(r.faculty_name || r['Name of the Faculty'] || r['Faculty Name'] || r['Faculty'] || '').trim(),
      funding_agency: String(r.funding_agency || r['Name of Funding Agency'] || r['Funding Agency'] || r['Agency'] || '').trim(),
      amount_received: Number(r.amount_received || r['Amount Received'] || r['Amount Received (₹)'] || r['Amount'] || 0),
      project_title: String(r.project_title || r['Title of the Project'] || r['Project Title'] || r['Title'] || '').trim(),
      month_year: String(r.month_year || r['Month and Year (MMYY)'] || r['Month Year'] || r['Month'] || '').trim(),
      total_projects: Number(r.total_projects || r['Total no. of Consultancy Projects'] || r['Total Projects'] || 0),
      total_client_orgs: Number(r.total_client_orgs || r['Total no. of Client Organizations'] || r['Total Client Organizations'] || r['Client Organizations'] || 0),
      proof_document: String(r.proof_document || r['Proof of Documents'] || r['Proof Link'] || r['Proof'] || r['Link'] || '').trim()
    })).filter(r => r.faculty_name);

    if (cleaned.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid consultancy rows found (Faculty Name missing)' });
    }

    if (mode !== 'append') {
      await Model.deleteMany({});
    }
    await Model.insertMany(cleaned);

    const allRecords = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    return res.json({
      success: true,
      message: `ETL Pipeline successfully processed and saved ${cleaned.length} consultancy records to table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: CONSULTANCY_DB_NAME,
      importedCount: cleaned.length,
      totalCount: allRecords.length,
      data: allRecords
    });
  } catch (error) {
    console.error(`Error in consultancy ETL pipeline for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process consultancy ETL pipeline: ' + error.message
    });
  }
});

/**
 * DELETE /api/consultancy/:deptId
 * Clear all consultancy records for a department
 */
app.delete('/api/consultancy/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getConsultancyModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared all consultancy records for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing consultancy for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear consultancy records from MongoDB',
      error: error.message
    });
  }
});

/**
 * ═════════════════════════════════════════════════════════
 * PROJECT FUNDING DATA API ROUTES (Database: project_funding_data)
 * ═════════════════════════════════════════════════════════
 */

/**
 * GET /api/project-funding/:deptId
 * Fetch all project funding records for a department
 */
app.get('/api/project-funding/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1, createdAt: 1 });
    return res.json({
      success: true,
      department: rawDeptId,
      collection: collectionName,
      database: PROJECT_FUNDING_DB_NAME,
      data: records
    });
  } catch (error) {
    console.error(`Error fetching project funding for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch project funding records from MongoDB',
      error: error.message
    });
  }
});

/**
 * POST /api/project-funding/:deptId
 * Save/Replace all project funding records for a department with title uniqueness check
 */
app.post('/api/project-funding/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    const { records } = req.body;
    if (!Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid payload: records array required' });
    }

    // Validate project title uniqueness within array
    const titleSet = new Set();
    const cleaned = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const pTitle = String(r.project_title || '').trim();
      const pName = String(r.pi_name || '').trim();
      if (!pName || !pTitle) continue;

      const titleLower = pTitle.toLowerCase();
      if (titleSet.has(titleLower)) {
        return res.status(400).json({
          success: false,
          message: `Duplicate Project Title found: "${pTitle}". Title of the project must be unique.`
        });
      }
      titleSet.add(titleLower);

      cleaned.push({
        department: collectionName,
        sl_no: Number(r.sl_no) || (i + 1),
        pi_name: pName,
        copi_name: String(r.copi_name || '').trim(),
        funding_agency: String(r.funding_agency || '').trim(),
        amount_received: Number(r.amount_received || 0),
        project_title: pTitle,
        month_year: String(r.month_year || '').trim()
      });
    }

    await Model.deleteMany({});
    if (cleaned.length > 0) {
      await Model.insertMany(cleaned);
    }

    const saved = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: `Successfully saved ${saved.length} project funding records for department "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName,
      database: PROJECT_FUNDING_DB_NAME,
      count: saved.length,
      data: saved
    });
  } catch (error) {
    console.error(`Error saving project funding for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save project funding records to MongoDB: ' + error.message,
      error: error.message
    });
  }
});

/**
 * POST /api/project-funding/:deptId/row
 * Add or update a single project funding row with title uniqueness check
 */
app.post('/api/project-funding/:deptId/row', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    const r = req.body;
    const slNo = Number(r.sl_no);
    const piName = String(r.pi_name || '').trim();
    const projectTitle = String(r.project_title || '').trim();

    if (!piName) {
      return res.status(400).json({ success: false, message: 'Name of the PI is required' });
    }
    if (!projectTitle) {
      return res.status(400).json({ success: false, message: 'Title of the Project is required' });
    }

    // Check project_title uniqueness in DB (excluding current sl_no)
    const escapedTitle = projectTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Model.findOne({
      sl_no: { $ne: slNo },
      project_title: { $regex: new RegExp(`^${escapedTitle}$`, 'i') }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Project Title "${projectTitle}" already exists. Title of the project must be unique.`
      });
    }

    const rowData = {
      department: collectionName,
      sl_no: slNo || (await Model.countDocuments() + 1),
      pi_name: piName,
      copi_name: String(r.copi_name || '').trim(),
      funding_agency: String(r.funding_agency || '').trim(),
      amount_received: Number(r.amount_received || 0),
      project_title: projectTitle,
      month_year: String(r.month_year || '').trim()
    };

    if (slNo) {
      await Model.findOneAndUpdate({ sl_no: slNo }, rowData, { upsert: true, new: true });
    } else {
      await Model.create(rowData);
    }

    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: 'Project funding record saved successfully',
      data: records
    });
  } catch (error) {
    console.error(`Error saving project funding row for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save project funding row: ' + error.message,
      error: error.message
    });
  }
});

/**
 * DELETE /api/project-funding/:deptId/row/:slNo
 * Delete a single project funding record by sl_no
 */
app.delete('/api/project-funding/:deptId/row/:slNo', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const slNo = Number(req.params.slNo);
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    await Model.deleteOne({ sl_no: slNo });
    const records = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });
    return res.json({
      success: true,
      message: `Deleted project funding record #${slNo}`,
      data: records
    });
  } catch (error) {
    console.error(`Error deleting project funding row for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete project funding record',
      error: error.message
    });
  }
});

/**
 * POST /api/project-funding/:deptId/etl-pipeline
 * Process Excel rows for project funding data (ETL)
 */
app.post('/api/project-funding/:deptId/etl-pipeline', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    const { rows, mode } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows provided in Excel payload' });
    }

    // Existing titles if mode === 'append'
    let existingTitles = new Set();
    if (mode === 'append') {
      const dbRecords = await Model.find({}, { project_title: 1 });
      dbRecords.forEach(d => {
        if (d.project_title) existingTitles.add(d.project_title.trim().toLowerCase());
      });
    }

    const cleaned = [];
    const fileTitles = new Set();
    const duplicateTitlesInFile = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const piName = String(
        r.pi_name || r['Name of the PI'] || r['PI Name'] || r['PI'] || r['Name of PI'] || ''
      ).trim();
      const projectTitle = String(
        r.project_title || r['Title of the Project'] || r['Project Title'] || r['Title'] || ''
      ).trim();

      if (!piName || !projectTitle) continue;

      const titleLower = projectTitle.toLowerCase();
      if (fileTitles.has(titleLower) || existingTitles.has(titleLower)) {
        duplicateTitlesInFile.push(projectTitle);
        continue; // skip duplicate title to maintain uniqueness requirement
      }

      fileTitles.add(titleLower);

      cleaned.push({
        department: collectionName,
        sl_no: Number(r.sl_no || r['Sl.No.'] || r['Sl. No.'] || r['SL.NO.'] || r['Sl No']) || (cleaned.length + 1),
        pi_name: piName,
        copi_name: String(
          r.copi_name || r['Name of the CO-PI'] || r['CO-PI Name'] || r['CO-PI'] || r['Name of CO-PI'] || r['CO PI'] || ''
        ).trim(),
        funding_agency: String(
          r.funding_agency || r['Name of Funding Agency'] || r['Funding Agency'] || r['Agency'] || ''
        ).trim(),
        amount_received: Number(
          r.amount_received || r['Amount Received'] || r['Amount Received (₹)'] || r['Amount'] || 0
        ),
        project_title: projectTitle,
        month_year: String(
          r.month_year || r['Month and Year (MON YYYY)'] || r['Month and Year'] || r['Month Year'] || r['Month'] || r['Year'] || ''
        ).trim()
      });
    }

    if (cleaned.length === 0) {
      return res.status(400).json({
        success: false,
        message: duplicateTitlesInFile.length > 0
          ? `No new unique records imported. Skipped ${duplicateTitlesInFile.length} rows because Project Title must be unique.`
          : 'No valid Project Funding rows found in Excel file (Name of the PI and Title of the Project are required)'
      });
    }

    if (mode !== 'append') {
      await Model.deleteMany({});
    }
    await Model.insertMany(cleaned);

    const allRecords = await Model.find({}, { _id: 0 }).sort({ sl_no: 1 });

    let successMsg = `ETL Pipeline successfully processed and saved ${cleaned.length} Project Funding records to database table "${collectionName}"`;
    if (duplicateTitlesInFile.length > 0) {
      successMsg += `. Note: Skipped ${duplicateTitlesInFile.length} duplicate project title(s) to enforce uniqueness.`;
    }

    return res.json({
      success: true,
      message: successMsg,
      department: rawDeptId,
      collection: collectionName,
      database: PROJECT_FUNDING_DB_NAME,
      importedCount: cleaned.length,
      skippedCount: duplicateTitlesInFile.length,
      totalCount: allRecords.length,
      data: allRecords
    });
  } catch (error) {
    console.error(`Error in Project Funding ETL pipeline for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process Project Funding ETL pipeline: ' + error.message
    });
  }
});

/**
 * DELETE /api/project-funding/:deptId
 * Clear all project funding records for a department
 */
app.delete('/api/project-funding/:deptId', async (req, res) => {
  try {
    const rawDeptId = req.params.deptId;
    const normalizedKey = (rawDeptId || '').trim().toUpperCase();
    const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;
    const Model = getProjectFundingModel(collectionName);

    await Model.deleteMany({});
    return res.json({
      success: true,
      message: `Cleared all project funding records for table "${collectionName}"`,
      department: rawDeptId,
      collection: collectionName
    });
  } catch (error) {
    console.error(`Error clearing project funding for ${req.params.deptId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear project funding records from MongoDB',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'student_strength', uptime: process.uptime() });
});

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`[Backend Server] Running on http://localhost:${PORT}`);
  console.log(`[Backend Server] Student strength API: http://localhost:${PORT}/api/student-strength/:deptId`);
  console.log(`[Backend Server] ETL Pipeline API: http://localhost:${PORT}/api/student-strength/etl-pipeline`);
});

module.exports = app;
