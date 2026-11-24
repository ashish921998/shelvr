require "uri"

exit unless ENV["CONFIGURATION"] == "Release"

unless /\Aappl_[A-Za-z0-9]+\z/.match?(ENV.fetch("SHELVR_REVENUECAT_KEY", ""))
  abort "error: Prepare the production RevenueCat SDK key before archiving"
end

unless /\A[A-Za-z0-9_]+\z/.match?(ENV.fetch("SHELVR_POSTHOG_TOKEN", ""))
  abort "error: Prepare the production analytics token before archiving"
end

begin
  host = URI.parse(ENV.fetch("SHELVR_POSTHOG_HOST", ""))
  valid = host.is_a?(URI::HTTPS) && !host.host.to_s.empty? &&
    host.userinfo.nil? && host.query.nil? && host.fragment.nil? &&
    ["", "/"].include?(host.path) && (1..65535).cover?(host.port)
rescue URI::InvalidURIError, ArgumentError
  valid = false
end
abort "error: Prepare a valid HTTPS analytics origin before archiving" unless valid
