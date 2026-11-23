class BackgroundType extends Enum {
	static __construct__ = ["BG_GARDEN", "BG_ATTIC", "BG_SEWER", "BG_ROAD", "BG_WOOD"];
	static BG_GARDEN = new this("BG_GARDEN", 0);
	static BG_ATTIC  = new this("BG_ATTIC",  1);
	static BG_SEWER  = new this("BG_SEWER",  2);
	static BG_ROAD   = new this("BG_ROAD",   3);
	static BG_WOOD   = new this("BG_WOOD",   4);
}
BackgroundType.resolve();