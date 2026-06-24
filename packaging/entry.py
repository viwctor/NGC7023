"""PyInstaller entry point.

The package's ``__main__.py`` uses a relative import (``from .main import main``),
which only works under ``python -m ngc7023``. PyInstaller runs the entry script
as the top-level ``__main__`` module with no parent package, so it needs an
absolute import instead. This tiny shim provides that without changing how
``python -m ngc7023`` behaves.
"""

from ngc7023.main import main

if __name__ == "__main__":
    main()
