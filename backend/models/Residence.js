class Residence {
  constructor(data) {
    this.residence_id = data.residence_id;
    this.residence_owner_id = data.residence_owner_id || null;
    this.residence_owner_name = data.residence_owner_name || null;
    this.residence_door_number = data.residence_door_number || null;
    this.residence_address_line_1 = data.residence_address_line_1 || null;
    this.residence_address_line_2 = data.residence_address_line_2 || null;
    this.residence_address_line_3 = data.residence_address_line_3 || null;
    this.residence_state = data.residence_state || null;
    this.residence_pin_code = data.residence_pin_code || null;
    this.residence_country = data.residence_country || null;
    this.residence_house_count = data.residence_house_count || 0;
    this.residence_owner_rating = data.residence_owner_rating != null ? String(data.residence_owner_rating) : null;
    // Optional owner photo: file extension stored when uploaded (jpg|png|webp); actual file under owner_photos/
    this.residence_owner_photo_ext = data.residence_owner_photo_ext
      ? String(data.residence_owner_photo_ext).toLowerCase().replace(/^\./, '')
      : '';

    // Legacy status field (map to new status)
    const legacyStatus = data.residence_status || 'Active';
    this.residence_status = legacyStatus;
    
    // Lifecycle Management Fields
    this.status = (legacyStatus === 'Active' || legacyStatus === 'active') ? 'active' : 'inactive';
    this.activeDate = data.activeDate || (this.status === 'active' ? new Date().toISOString() : null);
    this.inactiveDate = data.inactiveDate || (this.status === 'inactive' ? new Date().toISOString() : null);
    this.statusHistory = data.statusHistory || [];
    
    // Initialize status history if not present
    if (this.statusHistory.length === 0 && this.activeDate) {
      this.statusHistory.push({
        status: this.status,
        date: this.activeDate,
        reason: 'Initial creation'
      });
    }
  }
}

module.exports = Residence;

