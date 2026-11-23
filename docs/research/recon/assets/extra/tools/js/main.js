import { Enum         } from './js/_Boot/Enum.js';
import { Bytes        } from './haxe/io/Bytes.js';
import { Class        } from './js/_Boot/Class.js';
import { IntMap       } from './haxe/ds/IntMap.js';
import { BaseCode     } from './js/BaseCode.js';
import { StringMap    } from './haxe/ds/StringMap.js';
import { Serializer   } from './haxe/Serializer.js';
import { Unserializer } from './haxe/Unserializer.js';

const Global = {};

/* global Enum, Bytes, Class, IntMap, BaseCode, StringMap, Serializer, Unserializer */
class List extends Array {}
class ObjectMap extends Array {}

// /!\ FOR ALL ENUM : /!\
// The method names are not important, anyway the enumerations are serialized by
// index on  minitrooper (probably because on the server  the enums are in clear
// text while they are obfu in the swf).
import { TrooperType    } from './TrooperType.js';
import { ClientMode     } from './ClientMode.js';
import { MoveSystem     } from './MoveSystem.js';
import { TargetSystem   } from './TargetSystem.js';
import { TargetType     } from './TargetType.js';
import { Weapon         } from './Weapon.js';
import { Skill          } from './Skill.js';
import { ReloadSystem   } from './ReloadSystem.js';
import { BodyLoc        } from './BodyLoc.js';
import { BackgroundType } from './BackgroundType.js';

deobfu_block: {
    const OBFU_DICTIONARY = {
        "V\x1bE|"               : "pref",
        "\fA2c"                 : "seed",
        "$PS\x01"               : "gfx",
        ";\x01\fZ"              : "mode",
        "An%6"                  : "type",
        "}&\x16Y\x01"           : "force",
        "\x032\x1A4"            : "name",
        "7X\x01"                : "id",
        "\x0bR\x10\x1b\x02"     : "__CWeapon",      // enum Weapon
        "\x11!\x0ea\x01"        : "reloadSystem",
        "\x15S\x17?\x03"        : "targetType",
        "\x1a)\x13=\x01"        : "__CBody",        // enum BodyLoc
        "\x1dlQK\x03"           : "moveSystem",
        ")0\x19i\x03"           : "leftOver",
        ";uXE"                  : "targetSystem",
        ";\x1F\x0FJ"            : "army",
        "\x05(\x0Bm\x02"        : "action",
        "Vif0"                  : "ymax",
        "hW+a"                  : "xmax",
        "\x17\x06\t\x01"        : "fac",
        "\x10Gv\x01"            : "add",
        "\ng\x12;\x01"          : "space",
        "\nz\nv"                : "choices",
        "*M\x01"                : "bg",
        "a]e\x1B\x02"           : "armies",
        "`1\x1f*\x02"           : "troopers",
        "OPz\x16\x03"           : "faction",
        "K)\x16\n\x02"          : "__UP2"
    };
    function objectDeobfuscator(obj) {
        for(let k of Object.keys(obj)) {
            let type = Object.prototype.toString.call(obj[k]);
            type = type.replace(/^.*? (.*?)\]$/, '$1');
            if(type === "Array" || type === "Object") {
                obj[k] = objectDeobfuscator(obj[k]);
            }
            if(OBFU_DICTIONARY.hasOwnProperty(k)) {
                obj[OBFU_DICTIONARY[k]] = obj[k];
                delete obj[k];
            }
        }
        return obj;
    }
    Global.objectDeobfuscator = objectDeobfuscator;
}
/* eslint-enable no-multi-spaces */

let datas = document.body.innerHTML.match(/data=([A-Za-z0-9%\.-]+)/gi);
let d = new URLSearchParams(data).get('data'),
	r = Unserializer.unserialize(d);
r = Global.objectDeobfuscator(r);
console.log(r);
