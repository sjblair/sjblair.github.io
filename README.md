# stuart blair

a single-page, no-build developer profile: plain html/css/js, no framework, no dependencies. design influenced by peter saville, factory records, and jan tschichold.

## the scrobble spectrograph

the ridgeline chart sits beside the profile text in `fac 001`. it's wired to my last.fm account, so it renders real listening history with zero setup. anyone visiting the page can view that api key in source, this is fine, a plain last.fm api key is read-only for public data and can't scrobble, post, or modify the account. if the fetch ever fails it falls back to generated placeholder data automatically.
