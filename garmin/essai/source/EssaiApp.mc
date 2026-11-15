// Cadran d'essai : vérifie que le robot GitHub sait fabriquer un cadran Garmin (Fenix 6X Pro, 6S)
import Toybox.Application;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

class EssaiApp extends Application.AppBase {
    function initialize() { AppBase.initialize(); }
    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] { return [new EssaiVue()]; }
}

class EssaiVue extends WatchUi.WatchFace {
    function initialize() { WatchFace.initialize(); }
    function onUpdate(dc as Graphics.Dc) as Void {
        var t = System.getClockTime();
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK); dc.clear();
        dc.setColor(0x00AAAA, Graphics.COLOR_TRANSPARENT);
        dc.drawText(dc.getWidth() / 2, dc.getHeight() / 2, Graphics.FONT_NUMBER_THAI_HOT, t.hour.format("%02d") + ":" + t.min.format("%02d"), Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }
}
