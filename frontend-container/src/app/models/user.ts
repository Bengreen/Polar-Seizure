export enum AreaUnit {
  Hectares = 'hectares',
  Acres = 'acres',
}

export enum VolumeUnit {
  Litres = 'litres',
  Gallons = 'gallons',
}

export enum WeightUnit {
  Kilograms = 'kilograms',
  Pounds = 'pounds',
  Tonnes = 'tonnes',
  Tons = 'tons',
}

export enum DistanceUnit {
  Meters = 'meters',
  Kilometers = 'kilometers',
  Miles = 'miles',
}

export enum TemperatureUnit {
  Celsius = 'celsius',
  Fahrenheit = 'fahrenheit',
}

export interface UserPreferences {
  area: AreaUnit;
  volume: VolumeUnit;
  weight: WeightUnit;
  distance: DistanceUnit;
  temperature: TemperatureUnit;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role?: string;
  phone?: string;
  description?: string;
  is_suspended?: boolean;
  modules?: string[] | null;
  client_log_level?: string;
  preferences?: UserPreferences | null;
}
