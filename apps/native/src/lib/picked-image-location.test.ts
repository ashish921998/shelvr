import { describe, expect, it, vi } from 'vitest';

import { resolvePickedImageLocation } from './picked-image-location';

// The behavior under test is dependency-injected. These native module stubs
// only let the module load in Vitest's Node environment.
vi.mock('expo-media-library', () => ({
  Asset: class {},
  requestPermissionsAsync: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const androidDependencies = (overrides: Partial<Parameters<typeof resolvePickedImageLocation>[1]> = {}) => ({
  platform: 'android' as const,
  requestPhotoPermission: vi.fn().mockResolvedValue({ granted: true }),
  getAssetLocation: vi.fn().mockResolvedValue({ latitude: 12.5, longitude: -70.25 }),
  ...overrides,
});

describe('resolvePickedImageLocation', () => {
  it('uses ImagePicker EXIF without requesting broader photo access', async () => {
    const dependencies = androidDependencies();

    await expect(
      resolvePickedImageLocation(
        {
          assetId: 'content://photo/1',
          exif: {
            GPSLatitude: 40.7,
            GPSLatitudeRef: 'N',
            GPSLongitude: 74,
            GPSLongitudeRef: 'W',
          },
        },
        dependencies,
      ),
    ).resolves.toEqual({ latitude: 40.7, longitude: -74 });
    expect(dependencies.requestPhotoPermission).not.toHaveBeenCalled();
    expect(dependencies.getAssetLocation).not.toHaveBeenCalled();
  });

  it('falls back to the Android MediaStore asset when EXIF is absent', async () => {
    const dependencies = androidDependencies();

    await expect(
      resolvePickedImageLocation({ assetId: 'content://photo/2' }, dependencies),
    ).resolves.toEqual({ latitude: 12.5, longitude: -70.25 });
    expect(dependencies.requestPhotoPermission).toHaveBeenCalledOnce();
    expect(dependencies.getAssetLocation).toHaveBeenCalledWith('content://photo/2');
  });

  it('continues without location when permission is denied', async () => {
    const getAssetLocation = vi.fn();
    const dependencies = androidDependencies({
      requestPhotoPermission: vi.fn().mockResolvedValue({ granted: false }),
      getAssetLocation,
    });

    await expect(
      resolvePickedImageLocation({ assetId: 'content://photo/3' }, dependencies),
    ).resolves.toBeUndefined();
    expect(getAssetLocation).not.toHaveBeenCalled();
  });

  it('rejects invalid MediaStore coordinates without failing the save', async () => {
    const dependencies = androidDependencies({
      getAssetLocation: vi.fn().mockResolvedValue({ latitude: 0, longitude: 0 }),
    });

    await expect(
      resolvePickedImageLocation({ assetId: 'content://photo/4' }, dependencies),
    ).resolves.toBeUndefined();
  });

  it('does not request MediaLibrary access on iOS', async () => {
    const dependencies = androidDependencies({ platform: 'ios' });

    await expect(
      resolvePickedImageLocation({ assetId: 'ios-asset' }, dependencies),
    ).resolves.toBeUndefined();
    expect(dependencies.requestPhotoPermission).not.toHaveBeenCalled();
  });
});
