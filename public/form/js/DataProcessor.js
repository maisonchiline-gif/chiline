export class DataProcessor {
    static precalculateData(node, parent = null, index = 0, currentStart = 0, absoluteDepth = 0, topAncestorName = null) {
        node._parent = parent;
        node._id = parent ? `${parent._id}_${index}` : "root";
        node._startValue = currentStart;
        node._absoluteDepth = absoluteDepth;
        node._topAncestorName = absoluteDepth === 1 ? node.name : topAncestorName;

        if (node.children && node.children.length > 0) {
            let sum = 0;
            let childStart = currentStart;
            node.children.forEach((child, i) => {
                let childValue = this.precalculateData(child, node, i, childStart, absoluteDepth + 1, node._topAncestorName);
                childStart += childValue;
                sum += childValue;
            });
            node.realValue = sum;
            return sum;
        } else {
            node.realValue = parseFloat(node.value) || 0;
            return node.realValue;
        }
    }

    static parseTime(timeStr) {
        if (!timeStr) return null;
        if (typeof timeStr === 'string' && timeStr.includes(':')) {
            let parts = timeStr.split(':');
            return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(timeStr);
    }

    static getNodeStartTime(node, isPlayerReady, duration, rootRealValue) {
        if (node.time) return this.parseTime(node.time);
        if (!node._parent) return 0;
        if (node._parent.children[0] === node) return this.getNodeStartTime(node._parent, isPlayerReady, duration, rootRealValue);
        
        if (isPlayerReady && duration) {
            return (node._startValue / rootRealValue) * duration;
        }
        return 0;
    }

    static getNodeEndTime(node, isPlayerReady, duration, rootRealValue) {
        if (!node._parent) return isPlayerReady ? duration : 0;
        let siblings = node._parent.children;
        let index = siblings.indexOf(node);
        if (index < siblings.length - 1) {
            return this.getNodeStartTime(siblings[index + 1], isPlayerReady, duration, rootRealValue);
        } else {
            return this.getNodeEndTime(node._parent, isPlayerReady, duration, rootRealValue);
        }
    }
}