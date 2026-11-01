# shellcheck shell=bash
# Control. Shows what success looks like with the same fixtures and flags, so every failure
# below is a property of the situation and not of the lab.
TITLE="Control: a healthy dependency resolves, builds, and the consumer's test passes"
KIND=control
FIXES=(); WRONGS=()

scenario_setup() {
  fx_new; write_src; write_manifest 5.9
  fx_commit "AcmeKit 1.0.0 with a manifest" 1
  fx_tag 1.0.0
  consumer_init "$(dep 'from: "1.0.0"')"
}
