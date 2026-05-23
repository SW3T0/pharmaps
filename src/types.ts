export interface Pharmacy {
  id: string;
  xunta_id?: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  phone?: string;
  email?: string;
  contact_person?: string;
  notes?: string;
}

export interface Route {
  id: string;
  delegado_id: string;
  name?: string;
  date: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  distance_meters: number;
  duration_seconds: number;
  polyline?: string;
  created_at?: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  pharmacy_id: string;
  stop_order: number;
  status: 'pending' | 'completed' | 'skipped';
  check_in_time?: string;
  check_out_time?: string;
  notes?: string;
}
