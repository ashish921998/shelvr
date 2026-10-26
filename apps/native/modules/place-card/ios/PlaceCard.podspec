Pod::Spec.new do |s|
  s.name = 'PlaceCard'
  s.version = '1.0.0'
  s.summary = 'Google Places UI Kit cards for mapped saves.'
  s.description = s.summary
  s.author = ''
  s.homepage = 'https://developers.google.com/maps/documentation/places/ios-sdk/places-ui-kit-overview'
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GooglePlacesSwift', '10.15.0'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
