"""Removed module.

`app.core.security` was removed in favor of `app.core.oauth`.
Any remaining imports of this module should be updated. Importing this
module will raise an error to make unresolved references obvious at
import time.
"""

raise ImportError(
    "app.core.security has been removed; import from 'app.core.oauth' instead"
)
