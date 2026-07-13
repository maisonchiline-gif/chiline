export class AudioService {
    constructor(iframeId) {
        this.iframeElement = document.getElementById(iframeId);
        this.player = SC.Widget(this.iframeElement);
        this.isReady = false;
        this.duration = 0;
        
        // Коллбеки для связи с внешним миром
        this.onReady = () => {};
        this.onPlay = () => {};
        this.onPause = () => {};
        this.onProgress = () => {};
        this.onSeek = () => {};
    }

    init() {
        this.player.bind(SC.Widget.Events.READY, () => {
            this.isReady = true;
            this.player.getDuration((durationMs) => {
                this.duration = durationMs / 1000;
                this.onReady(this.duration);
            });
        });

        this.player.bind(SC.Widget.Events.PLAY, () => this.onPlay());
        this.player.bind(SC.Widget.Events.PAUSE, () => this.onPause());
        
        this.player.bind(SC.Widget.Events.PLAY_PROGRESS, (event) => {
            this.onProgress(event.currentPosition / 1000);
        });

        this.player.bind(SC.Widget.Events.SEEK, (event) => {
            this.onSeek(event.currentPosition / 1000);
        });
    }

    toggle() {
        if (!this.isReady) return;
        this.player.toggle();
    }

    play() {
        if (this.isReady) this.player.play();
    }

    seekTo(seconds) {
        if (this.isReady) this.player.seekTo(seconds * 1000);
    }
}