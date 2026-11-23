<?php

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


include_once("raw_flashvar_example.php");

$str = Main::unserialize($fv);

$deobfu = Main::deobfu($str);

print_r(json_decode($deobfu));
