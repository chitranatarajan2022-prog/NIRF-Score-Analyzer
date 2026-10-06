const mongoose = require('mongoose');
const { DEPARTMENTS, DEPARTMENT_ALIAS_MAP } = require('./DepartmentStrength');

const CONSULTANCY_DB_NAME = process.env.CONSULTANCY_DB_NAME || 'consultancy_data';

// Schema for individual Consultancy record per faculty per department
const consultancySchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: [true, 'Department identifier is required'],
      trim: true
    },
    sl_no: {
      type: Number,
      default: 1
    },
    faculty_name: {
      type: String,
      required: [true, 'Name of the Faculty is required'],
      trim: true
    },
    funding_agency: {
      type: String,
      default: '',
      trim: true
    },
    amount_received: {
      type: Number,
      default: 0
    },
    project_title: {
      type: String,
      default: '',
      trim: true
    },
    month_year: {
      // Stored as MMYY string e.g. "0124" for Jan 2024
      type: String,
      default: '',
      trim: true
    },
    total_projects: {
      type: Number,
      default: 0
    },
    total_client_orgs: {
      type: Number,
      default: 0
    },
    proof_document: {
      // URL / link to proof document
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Helper to get or register Mongoose model for a specific department collection in 'consultancy_data' database
const getConsultancyModel = (deptId) => {
  const normalizedKey = (deptId || '').trim().toUpperCase();
  const collectionName = DEPARTMENT_ALIAS_MAP[normalizedKey] || normalizedKey;

  // Use the dedicated 'consultancy_data' database
  const consultancyDb = mongoose.connection.useDb(CONSULTANCY_DB_NAME, { useCache: true });

  if (consultancyDb.models[collectionName]) {
    return consultancyDb.models[collectionName];
  }
  return consultancyDb.model(collectionName, consultancySchema, collectionName);
};

module.exports = {
  CONSULTANCY_DB_NAME,
  consultancySchema,
  getConsultancyModel,
  DEPARTMENTS,
  DEPARTMENT_ALIAS_MAP
};
