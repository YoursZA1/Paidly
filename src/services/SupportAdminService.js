/**
 * SupportAdminService
 * Backend support tools for admins
 * Handles user impersonation, activity logs, error tracking, admin notes, and data exports
 */

const IMPERSONATION_KEY = 'breakapi_impersonation';
const ADMIN_NOTES_KEY = 'breakapi_admin_notes';
const ERROR_TRACKING_KEY = 'breakapi_error_tracking';
const ACTIVITY_LOG_KEY = 'breakapi_global_activity_log';

class SupportAdminService {
  // ==================== User Impersonation ====================

  /**
   * Start impersonating a user (view-only mode)
   */
  static startImpersonation(adminId, adminName, targetUserId, targetUserName, reason = '') {
    const impersonation = {
      id: Date.now().toString(),
      adminId,
      adminName,
      targetUserId,
      targetUserName,
      reason,
      startedAt: new Date().toISOString(),
      isActive: true,
      mode: 'view-only'
    };

    localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(impersonation));

    // Log the impersonation start
    this.logActivity({
      type: 'IMPERSONATION_STARTED',
      action: 'Started User Impersonation',
      performedBy: adminName,
      performedById: adminId,
      targetUser: targetUserName,
      targetUserId,
      reason,
      severity: 'high'
    });

    return impersonation;
  }

  /**
   * Stop impersonation
   */
  static stopImpersonation() {
    const current = this.getCurrentImpersonation();
    if (current) {
      // Log the impersonation end
      this.logActivity({
        type: 'IMPERSONATION_ENDED',
        action: 'Ended User Impersonation',
        performedBy: current.adminName,
        performedById: current.adminId,
        targetUser: current.targetUserName,
        targetUserId: current.targetUserId,
        duration: this.calculateDuration(current.startedAt, new Date().toISOString()),
        severity: 'high'
      });
    }

    localStorage.removeItem(IMPERSONATION_KEY);
  }

  /**
   * Get current impersonation session
   */
  static getCurrentImpersonation() {
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    return stored ? JSON.parse(stored) : null;
  }

  /**
   * Check if currently impersonating
   */
  static isImpersonating() {
    return this.getCurrentImpersonation() !== null;
  }

  /**
   * Get impersonation history
   */
  static getImpersonationHistory() {
    const activities = this.getAllActivities();
    return activities.filter(a => 
      a.type === 'IMPERSONATION_STARTED' || a.type === 'IMPERSONATION_ENDED'
    );
  }

  // ==================== Admin Notes ====================

  /**
   * Add admin note for a user/account
   */
  static addAdminNote(targetType, targetId, targetName, note, adminId, adminName, priority = 'normal') {
    const notes = this.loadAdminNotes();
    
    const newNote = {
      id: Date.now().toString(),
      targetType, // 'user', 'account', 'invoice', etc.
      targetId,
      targetName,
      note,
      priority, // 'low', 'normal', 'high', 'urgent'
      adminId,
      adminName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      resolved: false
    };

    notes.push(newNote);
    this.saveAdminNotes(notes);

    // Log the note creation
    this.logActivity({
      type: 'ADMIN_NOTE_CREATED',
      action: 'Admin Note Created',
      performedBy: adminName,
      performedById: adminId,
      targetType,
      targetId,
      targetName,
      priority,
      severity: 'low'
    });

    return newNote;
  }

  /**
   * Update admin note
   */
  static updateAdminNote(noteId, updates, adminId, adminName) {
    const notes = this.loadAdminNotes();
    const index = notes.findIndex(n => n.id === noteId);
    
    if (index !== -1) {
      notes[index] = {
        ...notes[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveAdminNotes(notes);

      this.logActivity({
        type: 'ADMIN_NOTE_UPDATED',
        action: 'Admin Note Updated',
        performedBy: adminName,
        performedById: adminId,
        noteId,
        severity: 'low'
      });

      return notes[index];
    }
    return null;
  }

  /**
   * Delete admin note
   */
  static deleteAdminNote(noteId, adminId, adminName) {
    const notes = this.loadAdminNotes();
    const filtered = notes.filter(n => n.id !== noteId);
    this.saveAdminNotes(filtered);

    this.logActivity({
      type: 'ADMIN_NOTE_DELETED',
      action: 'Admin Note Deleted',
      performedBy: adminName,
      performedById: adminId,
      noteId,
      severity: 'low'
    });
  }

  /**
   * Get notes for specific target
   */
  static getNotesForTarget(targetType, targetId) {
    const notes = this.loadAdminNotes();
    return notes
      .filter(n => n.targetType === targetType && n.targetId === targetId)
      .sort((a, b) => {
        // Pinned notes first
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then by date
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }

  /**
   * Get all admin notes
   */
  static getAllAdminNotes() {
    return this.loadAdminNotes()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Search notes
   */
  static searchNotes(query) {
    const notes = this.loadAdminNotes();
    const lowerQuery = query.toLowerCase();
    
    return notes.filter(n => 
      n.note.toLowerCase().includes(lowerQuery) ||
      n.targetName.toLowerCase().includes(lowerQuery) ||
      n.adminName.toLowerCase().includes(lowerQuery)
    );
  }

  // ==================== Error & Issue Tracking ====================

  /**
   * Log an error or issue
   */
  static logError(errorData) {
    const errors = this.loadErrors();
    
    const error = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      severity: errorData.severity || 'medium', // 'low', 'medium', 'high', 'critical'
      type: errorData.type || 'general', // 'payment', 'invoice', 'auth', 'api', 'general'
      message: errorData.message,
      details: errorData.details || {},
      userId: errorData.userId || null,
      userName: errorData.userName || null,
      component: errorData.component || null,
      stackTrace: errorData.stackTrace || null,
      resolved: false,
      resolvedAt: null,
      resolvedBy: null,
      notes: []
    };

    errors.push(error);
    this.saveErrors(errors);

    // Log to activity log
    this.logActivity({
      type: 'ERROR_LOGGED',
      action: 'Error/Issue Logged',
      errorType: error.type,
      severity: error.severity,
      message: error.message
    });

    return error;
  }

  /**
   * Update error status
   */
  static updateError(errorId, updates, adminId, adminName) {
    const errors = this.loadErrors();
    const index = errors.findIndex(e => e.id === errorId);
    
    if (index !== -1) {
      errors[index] = {
        ...errors[index],
        ...updates
      };

      if (updates.resolved) {
        errors[index].resolvedAt = new Date().toISOString();
        errors[index].resolvedBy = adminName;
      }

      this.saveErrors(errors);

      this.logActivity({
        type: 'ERROR_UPDATED',
        action: 'Error Status Updated',
        performedBy: adminName,
        performedById: adminId,
        errorId,
        severity: 'medium'
      });

      return errors[index];
    }
    return null;
  }

  /**
   * Add note to error
   */
  static addErrorNote(errorId, note, adminId, adminName) {
    const errors = this.loadErrors();
    const index = errors.findIndex(e => e.id === errorId);
    
    if (index !== -1) {
      errors[index].notes.push({
        id: Date.now().toString(),
        note,
        adminId,
        adminName,
        timestamp: new Date().toISOString()
      });
      
      this.saveErrors(errors);
      return errors[index];
    }
    return null;
  }

  /**
   * Get all errors
   */
  static getAllErrors() {
    return this.loadErrors()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get unresolved errors
   */
  static getUnresolvedErrors() {
    return this.loadErrors()
      .filter(e => !e.resolved)
      .sort((a, b) => {
        // Sort by severity first
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        // Then by timestamp
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
  }

  /**
   * Get errors by type
   */
  static getErrorsByType(type) {
    return this.loadErrors()
      .filter(e => e.type === type)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get error statistics
   */
  static getErrorStats() {
    const errors = this.loadErrors();
    return {
      total: errors.length,
      unresolved: errors.filter(e => !e.resolved).length,
      bySeverity: {
        critical: errors.filter(e => e.severity === 'critical').length,
        high: errors.filter(e => e.severity === 'high').length,
        medium: errors.filter(e => e.severity === 'medium').length,
        low: errors.filter(e => e.severity === 'low').length
      },
      byType: {
        payment: errors.filter(e => e.type === 'payment').length,
        invoice: errors.filter(e => e.type === 'invoice').length,
        auth: errors.filter(e => e.type === 'auth').length,
        api: errors.filter(e => e.type === 'api').length,
        general: errors.filter(e => e.type === 'general').length
      }
    };
  }

  // ==================== Activity Logs ====================

  /**
   * Log activity
   */
  static logActivity(activityData) {
    const activities = this.loadActivities();
    
    const activity = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...activityData
    };

    activities.push(activity);
    
    // Keep last 10000 activities
    if (activities.length > 10000) {
      activities.splice(0, activities.length - 10000);
    }

    this.saveActivities(activities);
    return activity;
  }

  /**
   * Get all activities
   */
  static getAllActivities() {
    return this.loadActivities()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get activities by type
   */
  static getActivitiesByType(type) {
    return this.loadActivities()
      .filter(a => a.type === type)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Get activities by user
   */
  static getActivitiesByUser(userId) {
    return this.loadActivities()
      .filter(a => a.performedById === userId || a.targetUserId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Search activities
   */
  static searchActivities(query) {
    const activities = this.loadActivities();
    const lowerQuery = query.toLowerCase();
    
    return activities.filter(a => 
      a.action?.toLowerCase().includes(lowerQuery) ||
      a.performedBy?.toLowerCase().includes(lowerQuery) ||
      a.targetUser?.toLowerCase().includes(lowerQuery) ||
      a.type?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get activity statistics
   */
  static getActivityStats(days = 30) {
    const activities = this.loadActivities();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentActivities = activities.filter(a => 
      new Date(a.timestamp) >= cutoffDate
    );

    return {
      total: activities.length,
      recent: recentActivities.length,
      byType: this.groupByField(recentActivities, 'type'),
      bySeverity: this.groupByField(recentActivities, 'severity'),
      topUsers: this.getTopPerformers(recentActivities, 'performedBy')
    };
  }

  // ==================== Data Export ====================

  /**
   * Export all system data as CSV
   */
  static exportSystemData() {
    return {
      users: this.exportUsersCSV(),
      activities: this.exportActivitiesCSV(),
      errors: this.exportErrorsCSV(),
      notes: this.exportNotesCSV(),
      impersonation: this.exportImpersonationCSV()
    };
  }

  /**
   * Export users as CSV
   */
  static exportUsersCSV() {
    try {
      const users = JSON.parse(localStorage.getItem('breakapi_user_management') || '[]');
      
      const headers = ['ID', 'Name', 'Email', 'Company', 'Plan', 'Status', 'Created At', 'Last Login'];
      const rows = users.map(u => [
        u.id,
        u.name,
        u.email,
        u.company,
        u.plan,
        u.status,
        u.created_at,
        u.lastLogin
      ]);

      return this.arrayToCSV([headers, ...rows]);
    } catch (error) {
      console.error('Error exporting users:', error);
      return '';
    }
  }

  /**
   * Export activities as CSV
   */
  static exportActivitiesCSV() {
    const activities = this.getAllActivities();
    
    const headers = ['ID', 'Timestamp', 'Type', 'Action', 'Performed By', 'Target User', 'Severity'];
    const rows = activities.map(a => [
      a.id,
      a.timestamp,
      a.type || '',
      a.action || '',
      a.performedBy || '',
      a.targetUser || '',
      a.severity || ''
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Export errors as CSV
   */
  static exportErrorsCSV() {
    const errors = this.getAllErrors();
    
    const headers = ['ID', 'Timestamp', 'Severity', 'Type', 'Message', 'User', 'Component', 'Resolved'];
    const rows = errors.map(e => [
      e.id,
      e.timestamp,
      e.severity,
      e.type,
      e.message,
      e.userName || '',
      e.component || '',
      e.resolved ? 'Yes' : 'No'
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Export admin notes as CSV
   */
  static exportNotesCSV() {
    const notes = this.getAllAdminNotes();
    
    const headers = ['ID', 'Created At', 'Target Type', 'Target Name', 'Note', 'Priority', 'Admin', 'Resolved'];
    const rows = notes.map(n => [
      n.id,
      n.createdAt,
      n.targetType,
      n.targetName,
      n.note,
      n.priority,
      n.adminName,
      n.resolved ? 'Yes' : 'No'
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Export impersonation history as CSV
   */
  static exportImpersonationCSV() {
    const history = this.getImpersonationHistory();
    
    const headers = ['Timestamp', 'Action', 'Admin', 'Target User', 'Reason', 'Duration'];
    const rows = history.map(h => [
      h.timestamp,
      h.action,
      h.performedBy || '',
      h.targetUser || '',
      h.reason || '',
      h.duration || ''
    ]);

    return this.arrayToCSV([headers, ...rows]);
  }

  /**
   * Download CSV file
   */
  static downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Download all system data as ZIP
   */
  static async downloadAllData() {
    const data = this.exportSystemData();
    const timestamp = new Date().toISOString().split('T')[0];

    // Download each CSV separately
    Object.keys(data).forEach(key => {
      if (data[key]) {
        this.downloadCSV(data[key], `${key}_${timestamp}.csv`);
      }
    });
  }

  // ==================== Helper Methods ====================

  static loadAdminNotes() {
    const stored = localStorage.getItem(ADMIN_NOTES_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveAdminNotes(notes) {
    localStorage.setItem(ADMIN_NOTES_KEY, JSON.stringify(notes));
  }

  static loadErrors() {
    const stored = localStorage.getItem(ERROR_TRACKING_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveErrors(errors) {
    localStorage.setItem(ERROR_TRACKING_KEY, JSON.stringify(errors));
  }

  static loadActivities() {
    const stored = localStorage.getItem(ACTIVITY_LOG_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static saveActivities(activities) {
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(activities));
  }

  static calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diff = Math.abs(end - start);
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  }

  static groupByField(items, field) {
    return items.reduce((acc, item) => {
      const key = item[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  static getTopPerformers(items, field, limit = 10) {
    const grouped = this.groupByField(items, field);
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  static arrayToCSV(data) {
    return data.map(row => 
      row.map(cell => {
        const cellStr = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');
  }

  /**
   * Generate sample data for demo
   */
  static generateSampleData() {
    // Sample errors
    const sampleErrors = [
      {
        severity: 'high',
        type: 'payment',
        message: 'Payment gateway timeout',
        details: { gateway: 'stripe', amount: 99.99 },
        userId: '1',
        userName: 'John Doe',
        component: 'PaymentProcessor'
      },
      {
        severity: 'medium',
        type: 'invoice',
        message: 'Failed to generate PDF',
        details: { invoiceId: 'INV-001' },
        userId: '2',
        userName: 'Jane Smith',
        component: 'PDFGenerator'
      },
      {
        severity: 'critical',
        type: 'auth',
        message: 'Multiple failed login attempts detected',
        details: { attempts: 5, ip: '192.168.1.1' },
        userId: null,
        userName: null,
        component: 'AuthService'
      }
    ];

    sampleErrors.forEach(error => this.logError(error));

    // Sample admin notes
    const sampleNotes = [
      {
        targetType: 'user',
        targetId: '1',
        targetName: 'John Doe',
        note: 'User requested refund for overcharge. Approved and processed.',
        adminId: 'admin1',
        adminName: 'Admin User',
        priority: 'high'
      },
      {
        targetType: 'account',
        targetId: '2',
        targetName: 'ABC Corp',
        note: 'Account on watch list due to multiple chargebacks.',
        adminId: 'admin1',
        adminName: 'Admin User',
        priority: 'urgent'
      }
    ];

    sampleNotes.forEach(note => 
      this.addAdminNote(note.targetType, note.targetId, note.targetName, note.note, note.adminId, note.adminName, note.priority)
    );
  }
}

export default SupportAdminService;
