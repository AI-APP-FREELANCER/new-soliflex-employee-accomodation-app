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
    this.residence_status = data.residence_status || 'Active';
  }
}

module.exports = Residence;

