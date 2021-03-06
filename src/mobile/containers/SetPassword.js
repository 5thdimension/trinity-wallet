import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { translate } from 'react-i18next';
import { StyleSheet, View, Text, TouchableWithoutFeedback, Keyboard, KeyboardAvoidingView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { connect } from 'react-redux';
import {
    increaseSeedCount,
    addAccountName,
    setOnboardingComplete,
    setBasicAccountInfo,
} from 'iota-wallet-shared-modules/actions/accounts';
import { clearWalletData, clearSeed, setPassword } from 'iota-wallet-shared-modules/actions/wallet';
import { passwordReasons } from 'iota-wallet-shared-modules/libs/password';
import { generateAlert } from 'iota-wallet-shared-modules/actions/alerts';
import { zxcvbn } from 'iota-wallet-shared-modules/libs/exports';
import CustomTextInput from '../components/CustomTextInput';
import {
    hasDuplicateSeed,
    hasDuplicateAccountName,
    storeSeedInKeychain,
    getAllSeedsFromKeychain,
    storeSaltInKeychain,
} from '../utils/keychain';
import { generatePasswordHash, getRandomBytes } from '../utils/crypto';
import OnboardingButtons from '../containers/OnboardingButtons';
import StatefulDropdownAlert from './StatefulDropdownAlert';
import { isAndroid } from '../utils/device';
import { width, height } from '../utils/dimensions';
import InfoBox from '../components/InfoBox';
import { Icon } from '../theme/icons.js';
import GENERAL from '../theme/general';
import Header from '../components/Header';
import { leaveNavigationBreadcrumb } from '../utils/bugsnag';

const MIN_PASSWORD_LENGTH = 11;
console.ignoredYellowBox = ['Native TextInput'];

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    topContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: height / 16,
    },
    midContainer: {
        flex: 3,
        justifyContent: 'space-around',
        alignItems: 'center',
        width,
    },
    bottomContainer: {
        flex: 0.5,
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    infoText: {
        fontFamily: 'SourceSansPro-Light',
        fontSize: GENERAL.fontSize3,
        textAlign: 'left',
        backgroundColor: 'transparent',
    },
    warningText: {
        fontFamily: 'SourceSansPro-Bold',
        fontSize: GENERAL.fontSize3,
        textAlign: 'left',
        paddingTop: height / 70,
        backgroundColor: 'transparent',
    },
});

/** Set Password component */
class SetPassword extends Component {
    static propTypes = {
        /** Navigation object */
        navigator: PropTypes.object.isRequired,
        /** @ignore */
        t: PropTypes.func.isRequired,
        /** @ignore */
        setOnboardingComplete: PropTypes.func.isRequired,
        /** @ignore */
        clearWalletData: PropTypes.func.isRequired,
        /** @ignore */
        clearSeed: PropTypes.func.isRequired,
        /** @ignore */
        increaseSeedCount: PropTypes.func.isRequired,
        /** @ignore */
        addAccountName: PropTypes.func.isRequired,
        /** @ignore */
        generateAlert: PropTypes.func.isRequired,
        /** @ignore */
        setPassword: PropTypes.func.isRequired,
        /** @ignore */
        seed: PropTypes.string.isRequired,
        /** @ignore */
        theme: PropTypes.object.isRequired,
        /** @ignore */
        accountName: PropTypes.string.isRequired,
        /** @ignore */
        setBasicAccountInfo: PropTypes.func.isRequired,
        /** @ignore */
        usedExistingSeed: PropTypes.bool.isRequired,
    };

    constructor() {
        super();
        this.state = {
            password: '',
            reentry: '',
        };
    }

    componentDidMount() {
        leaveNavigationBreadcrumb('SetPassword');
    }

    /**
     * Stores seed in keychain and clears seed from state
     * @method onDonePress
     * @returns {Promise<void>}
     */
    async onDonePress() {
        const { theme: { body }, usedExistingSeed } = this.props;
        const ifNoKeychainDuplicates = (pwdHash, salt, seed, accountName) => {
            storeSeedInKeychain(pwdHash, seed, accountName)
                .then(async () => {
                    await storeSaltInKeychain(salt);
                    this.props.setPassword(pwdHash);
                    this.props.addAccountName(accountName);
                    // Set basic account info
                    this.props.setBasicAccountInfo({ accountName, usedExistingSeed });
                    this.props.increaseSeedCount();
                    this.props.clearWalletData();
                    this.props.clearSeed();
                    this.props.setOnboardingComplete(true);
                    this.props.navigator.push({
                        screen: 'onboardingComplete',
                        navigatorStyle: {
                            navBarHidden: true,
                            navBarTransparent: true,
                            topBarElevationShadowEnabled: false,
                            screenBackgroundColor: body.bg,
                            drawUnderStatusBar: true,
                            statusBarColor: body.bg,
                        },
                        appStyle: {
                            orientation: 'portrait',
                            keepStyleAcrossPush: true,
                        },
                        animated: false,
                    });
                })
                .catch(() => {
                    this.props.generateAlert(
                        'error',
                        t('global:somethingWentWrong'),
                        t('global:somethingWentWrongRestart'),
                    );
                });
        };

        const { t, seed, accountName } = this.props;
        const { password, reentry } = this.state;
        const score = zxcvbn(password);

        if (password.length >= MIN_PASSWORD_LENGTH && password === reentry && score.score === 4) {
            const salt = await getRandomBytes(32);
            const pwdHash = await generatePasswordHash(password, salt);
            getAllSeedsFromKeychain(pwdHash).then((seedInfo) => {
                if (hasDuplicateAccountName(seedInfo, accountName)) {
                    return this.props.generateAlert(
                        'error',
                        t('addAdditionalSeed:nameInUse'),
                        t('addAdditionalSeed:nameInUseExplanation'),
                    );
                } else if (hasDuplicateSeed(seedInfo, seed)) {
                    return this.props.generateAlert(
                        'error',
                        t('addAdditionalSeed:seedInUse'),
                        t('addAdditionalSeed:seedInUseExplanation'),
                    );
                }
                return ifNoKeychainDuplicates(pwdHash, salt, seed, accountName);
            });
        } else if (!(password === reentry)) {
            this.props.generateAlert('error', t('passwordMismatch'), t('passwordMismatchExplanation'));
        } else if (password.length < MIN_PASSWORD_LENGTH || reentry.length < MIN_PASSWORD_LENGTH) {
            this.props.generateAlert(
                'error',
                t('passwordTooShort'),
                t('passwordTooShortExplanation', {
                    minLength: MIN_PASSWORD_LENGTH,
                    currentLength: password.length,
                }),
            );
        } else if (score.score < 4) {
            const reason = score.feedback.warning
                ? t(`changePassword:${passwordReasons[score.feedback.warning]}`)
                : t('changePassword:passwordTooWeakReason');
            return this.props.generateAlert('error', t('changePassword:passwordTooWeak'), reason);
        }
    }

    /**
     * Pops the active screen from the navigation stack
     * @method onBackPress
     */
    onBackPress() {
        this.props.navigator.pop({
            animated: false,
        });
    }

    renderContent() {
        const { t, theme, theme: { body } } = this.props;
        const { password, reentry } = this.state;
        const score = zxcvbn(password);
        const isValid = score.score === 4;

        return (
            <View>
                <TouchableWithoutFeedback style={{ flex: 1, width }} onPress={Keyboard.dismiss} accessible={false}>
                    <KeyboardAvoidingView behavior="padding" style={[styles.container, { backgroundColor: body.bg }]}>
                        <View style={styles.topContainer}>
                            <Icon name="iota" size={width / 8} color={body.color} />
                            <View style={{ flex: 0.7 }} />
                            <Header textColor={body.color}>{t('choosePassword')}</Header>
                        </View>
                        <View style={styles.midContainer}>
                            <InfoBox
                                body={body}
                                text={
                                    <View>
                                        <Text style={[styles.infoText, { color: body.color }]}>
                                            {t('anEncryptedCopy')}
                                        </Text>
                                        <Text style={[styles.warningText, { color: body.color }]}>
                                            {t('changePassword:ensureStrongPassword')}
                                        </Text>
                                    </View>
                                }
                            />
                            <View style={{ flex: 0.2 }} />
                            <CustomTextInput
                                label={t('global:password')}
                                onChangeText={(password) => this.setState({ password })}
                                containerStyle={{ width: width / 1.15 }}
                                autoCapitalize="none"
                                widget="password"
                                isPasswordValid={isValid}
                                passwordStrength={score.score}
                                autoCorrect={false}
                                enablesReturnKeyAutomatically
                                returnKeyType="next"
                                onSubmitEditing={() => {
                                    if (password) {
                                        this.reentry.focus();
                                    }
                                }}
                                secureTextEntry
                                testID="setPassword-passwordbox"
                                theme={theme}
                            />
                            <View style={{ flex: 0.2 }} />
                            <CustomTextInput
                                onRef={(c) => {
                                    this.reentry = c;
                                }}
                                label={t('retypePassword')}
                                onChangeText={(reentry) => this.setState({ reentry })}
                                containerStyle={{ width: width / 1.15 }}
                                widget="passwordReentry"
                                isPasswordValid={isValid && password === reentry}
                                autoCapitalize="none"
                                autoCorrect={false}
                                enablesReturnKeyAutomatically
                                returnKeyType="done"
                                onSubmitEditing={() => this.onDonePress()}
                                secureTextEntry
                                testID="setPassword-reentrybox"
                                theme={theme}
                            />
                            <View style={{ flex: 0.3 }} />
                        </View>
                        <View style={styles.bottomContainer}>
                            <OnboardingButtons
                                onLeftButtonPress={() => this.onBackPress()}
                                onRightButtonPress={() => this.onDonePress()}
                                leftButtonText={t('global:goBack')}
                                rightButtonText={t('global:done')}
                            />
                        </View>
                    </KeyboardAvoidingView>
                </TouchableWithoutFeedback>
            </View>
        );
    }

    render() {
        const { theme: { body } } = this.props;

        return (
            <View style={styles.container}>
                {isAndroid ? (
                    <View style={styles.container}>{this.renderContent()}</View>
                ) : (
                    <KeyboardAwareScrollView
                        resetScrollToCoords={{ x: 0, y: 0 }}
                        contentContainerStyle={styles.container}
                        scrollEnabled={false}
                        enableOnAndroid={false}
                    >
                        {this.renderContent()}
                    </KeyboardAwareScrollView>
                )}
                <StatefulDropdownAlert textColor={body.color} backgroundColor={body.bg} />
            </View>
        );
    }
}

const mapStateToProps = (state) => ({
    seed: state.wallet.seed,
    accountName: state.wallet.accountName,
    usedExistingSeed: state.wallet.usedExistingSeed,
    theme: state.settings.theme,
});

const mapDispatchToProps = {
    setOnboardingComplete,
    clearWalletData,
    clearSeed,
    increaseSeedCount,
    addAccountName,
    generateAlert,
    setPassword,
    setBasicAccountInfo,
};

export default translate(['setPassword', 'global', 'addAdditionalSeed'])(
    connect(mapStateToProps, mapDispatchToProps)(SetPassword),
);
