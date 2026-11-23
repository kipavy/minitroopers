# Désérialiser / Déobfusquer via PHP

## Pré-requis

- PHP

## Intégration

```php
set_include_path(get_include_path().PATH_SEPARATOR.__DIR__.'/lib');
spl_autoload_register(
	function($class){
		$file = stream_resolve_include_path(str_replace('\\', '/', $class) .'.php');
		if ($file) {
			include_once $file;
		}
	}
);
\php\Boot::__hx__init();
if (version_compare(PHP_VERSION, "8.1.0", ">=")) error_reporting(error_reporting() & ~E_DEPRECATED);
```

## Usage

### Désérialiser

```php
$str = Main::unserialize($flashvars);
$json = json_decode($str);
```

### Déobfusquer

```php
$str = Main::unserialize($flashvars);
$deobfu = Main::deobfu($str);
$json = json_decode($deobfu));
```

### Dictionaire

terme obfusqué | term | note
---|---|---
`V\u001bE\|` | `pref` |
`\fA2c` | `seed` |
`$PS\u0001` | `gfx` |
`;\u0001\fZ` | `mode` |
`An%6` | `type` |
`}&\u0016Y\u0001` | `force` |
`\u00032\u001a4` | `name` |
`7X\u0001` | `id` |
`\u000bR\u0010\u001b\u0002` | `__CWeapon` | enum Weapon
`\u0011!\u000ea\u0001` | `reloadSystem` |
`\u0015S\u0017?\u0003` | `targetType` |
`\u001a)\u0013=\u0001` | `__CBody` | enum BodyLoc
`\u001dlQK\u0003` | `moveSystem` |
`)0\u0019i\u0003` | `leftOver` |
`;uXE` | `targetSystem` |
`;\u001F\u000FJ` | `army` |
`\u0005(\u000Bm\u0002` | `action` |
`Vif0` | `ymax` |
`hW+a` | `xmax` |
`\u0017\u0006\t\u0001` | `fac` |
`\u0010Gv\u0001` | `add` |
`\ng\u0012;\u0001` | `space` |
`\nz\nv` | `choices` |
`*M\u0001` | `bg` |
`a]e\u001b\u0002` | `armies` |
`` `1\u001f*\u0002`` | `troopers` |
`OPz\u0016\u0003` | `faction` |
`K)\u0016\n\u0002` | `__UP2` | Priorité ?