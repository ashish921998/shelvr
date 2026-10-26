Pod::Spec.new do |s|
  s.name           = 'ApplePlaceCard'
  s.version        = '1.0.0'
  s.summary        = 'Apple place card sheet via MKMapItemDetailViewController.'
  s.description    = 'Presents the MapKit place card for an Apple Maps place id, with a strip that opens the save.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
