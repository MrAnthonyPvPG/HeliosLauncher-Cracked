const { normalize } = require('path');
const { URL } = require('url');

class MavenUtil {
    static ID_REGEX = /([^@:]+):([^@:]+):?([^@:]+)?:?(?:([^@:]+))?:?(?:@{1}([^@:]+))?/;

    static mavenComponentsToIdentifier(group, artifact, version, classifier, extension) {
        return `${group}:${artifact}:${version}${classifier != null ? `:${classifier}` : ''}${extension != null ? `@${extension}` : ''}`;
    }

    static mavenComponentsToExtensionlessIdentifier(group, artifact, version, classifier) {
        return MavenUtil.mavenComponentsToIdentifier(group, artifact, version, classifier);
    }

    static mavenComponentsToVersionlessIdentifier(group, artifact, classifier) {
        return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
    }

    static isMavenIdentifier(id) {
        return MavenUtil.ID_REGEX.test(id);
    }

    static getMavenComponents(id, extension = 'jar') {
        if (!MavenUtil.isMavenIdentifier(id)) {
            throw new Error('Id is not a maven identifier.');
        }
        const result = MavenUtil.ID_REGEX.exec(id);
        if (result != null) {
            return {
                group: result[1],
                artifact: result[2],
                version: result[3],
                classifier: result[4],
                extension: result[5] || extension
            };
        }
        throw new Error('Failed to process maven data.');
    }

    static mavenIdentifierAsPath(id, extension = 'jar') {
        const tmp = MavenUtil.getMavenComponents(id, extension);
        return MavenUtil.mavenComponentsAsPath(tmp.group, tmp.artifact, tmp.version, tmp.classifier, tmp.extension);
    }

    static mavenComponentsAsPath(group, artifact, version, classifier, extension = 'jar') {
        return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier != null ? `-${classifier}` : ''}.${extension}`;
    }

    static mavenIdentifierToUrl(id, extension = 'jar') {
        return new URL(MavenUtil.mavenIdentifierAsPath(id, extension));
    }

    static mavenComponentsToUrl(group, artifact, version, classifier, extension = 'jar') {
        return new URL(MavenUtil.mavenComponentsAsPath(group, artifact, version, classifier, extension));
    }

    static mavenIdentifierToPath(id, extension = 'jar') {
        return normalize(MavenUtil.mavenIdentifierAsPath(id, extension));
    }

    static mavenComponentsAsNormalizedPath(group, artifact, version, classifier, extension = 'jar') {
        return normalize(MavenUtil.mavenComponentsAsPath(group, artifact, version, classifier, extension));
    }
}

module.exports = { MavenUtil }
