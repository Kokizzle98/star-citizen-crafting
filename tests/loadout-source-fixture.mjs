// Synthetic, self-invented fixtures for the F4-S loadout source tests. Nothing
// here is copied from scunpacked-data: names, class names and UUIDs are made
// up, and only the document shape mirrors the structure the generator reads.

export const COMMIT = '0123456789abcdef0123456789abcdef01234567'
export const SUBJECT = '9.9.9-LIVE.1000'

export const U = {
  vehicleA: '11111111-1111-4111-8111-000000000001',
  vehicleB: '11111111-1111-4111-8111-000000000002',
  cooler: '22222222-2222-4222-8222-000000000001',
  shield: '22222222-2222-4222-8222-000000000002',
  sensor: '22222222-2222-4222-8222-000000000003',
  unknown: '22222222-2222-4222-8222-0000000000ff',
}

export const port = (portId, overrides = {}) => ({
  HardpointName: `hardpoint_${portId.replace('.', '_')}`,
  Editable: true,
  EditableChildren: true,
  CompatibleTypes: [{ Type: 'Cooler', SubTypes: ['Small'] }],
  MaxSize: 2,
  MinSize: 1,
  PortId: portId,
  RootPortId: portId.split('/')[0],
  Path: [`hardpoint_${portId}`],
  ...overrides,
})

const installed = (uuid, className, type) => ({ UUID: uuid, ClassName: className, Name: `Invented ${className}`, Type: type })

export function vehicleDocuments() {
  return [
    {
      UUID: U.vehicleB, ClassName: 'TEST_Vehicle_Beta', Name: 'Testwing Beta', IsSpaceship: true, IsVehicle: false,
      Loadout: [
        port('loadout.0', { ...installed(U.cooler, 'TEST_Part_Cooler', 'Cooler.UNDEFINED'), Editable: false, EditableChildren: false }),
        port('loadout.1', { ...installed(U.shield, 'TEST_Part_Shield', 'Shield.UNDEFINED') }),
      ],
    },
    {
      UUID: U.vehicleA, ClassName: 'TEST_Vehicle_Alpha', Name: 'Testwing Alpha', IsSpaceship: true, IsVehicle: false,
      Loadout: [
        port('loadout.0', {
          ...installed(U.cooler, 'TEST_Part_Cooler', 'Cooler.UNDEFINED'),
          RequiredTags: ['TEST_Alpha_Tag'], PortTags: ['TestPortTag'],
          Loadout: [port('loadout.0/child', { ...installed(U.sensor, 'TEST_Part_Sensor', 'Sensor.UNDEFINED'), Editable: false })],
        }),
        port('loadout.1', { ...installed(U.cooler, 'TEST_Part_Cooler_Variant', 'Cooler.UNDEFINED') }),
        port('loadout.2'),
        port('loadout.3', { HardpointName: '', Path: [''] }),
      ],
    },
  ]
}
