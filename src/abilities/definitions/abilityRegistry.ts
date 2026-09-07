import type { CardDefinition } from '../../types/card'
import { namorAbilities } from './namor'
import { kopalaAbilities } from './kopala'
import { moonlitMeditationAbilities } from './moonlitMeditation'
import { secretInvasionAbilities } from './secretInvasion'
import { stormOfSarumanAbilities } from './stormOfSaruman'
import { theKeyToTheVaultAbilities } from './theKeyToTheVault'
import { sorcerousSquallAbilities } from './sorcerousSquall'
import { briberyAbilities } from './bribery'
import { mistDancerAbilities } from './mistDancer'
import { aqueousFormAbilities } from './aqueousForm'
import { curiousFarmAnimalsAbilities } from './curiousFarmAnimals'
import { rivendellAbilities } from './rivendell'
import { senuAbilities } from './senu'
import { theGreyHavensAbilities } from './theGreyHavens'
import { crumbAndGetItAbilities } from './crumbAndGetIt'
import { dawnsTruceAbilities } from './dawnsTruce'
import { intoTheFloodMawAbilities } from './intoTheFloodMaw'
import { kitnapAbilities } from './kitnap'
import { longRiversPullAbilities } from './longRiversPull'
import { foodTokenAbilities } from './foodToken'
import { honestWorkAbilities } from './honestWork'
import { kataraWaterTribesHopeAbilities } from './kataraWaterTribesHope'
import { luxiorGiadasGiftAbilities } from './luxiorGiadasGift'
import { thassaGodOfTheSeaAbilities } from './thassaGodOfTheSea'
import { wreckingBallArmAbilities } from './wreckingBallArm'
import { eiganjoCastleAbilities } from './eiganjoCastle'
import { caduceusStaffOfHermesAbilities } from './caduceusStaffOfHermes'
import { pippinGuardOfTheCitadelAbilities } from './pippinGuardOfTheCitadel'
import { everybodyLivesAbilities } from './everybodyLives'
import { teferisProtectionAbilities } from './teferisProtection'
import {
  aangAndLaOceansFuryAbilities,
  aangSwiftSaviorAbilities,
  aangTheLastAirbenderAbilities,
} from './aangAirbend'
import { eiganjoSeatOfTheEmpireAbilities } from './eiganjoSeatOfTheEmpire'
import {
  lilypadVillageAbilities,
  lupinflowerVillageAbilities,
} from './restrictedManaVillages'
import {
  abandonedAirTempleAbilities,
  aerithAbilities,
  agnaQelaAbilities,
  anOfferYouCantRefuseAbilities,
  animalSanctuaryAbilities,
  arcaneSignetAbilities,
  blackbladeReforgedAbilities,
  brotherhoodRegaliaAbilities,
  commandTowerAbilities,
  dayOfDestinyAbilities,
  desynchronizationAbilities,
  dovinsVetoAbilities,
  enterTheAvatarStateAbilities,
  esiorAbilities,
  floweringWhiteTreeAbilities,
  glacialFortressAbilities,
  grandArbiterAbilities,
  hammerOfNazahnAbilities,
  heraldSecretStreamsAbilities,
  ishaiAbilities,
  k9Abilities,
  kwainAbilities,
  minasTirithAbilities,
  mithrilCoatAbilities,
  momoPlayfulPetAbilities,
  prairieStreamAbilities,
  repelCalamityAbilities,
  rosaAbilities,
  swiftfootBootsAbilities,
  tesharAbilities,
  theOozeAbilities,
  trenzaloreAbilities,
  tyLeeAbilities,
  unbreakableFormationAbilities,
  urdnanAbilities,
  venatAbilities,
  yoshimaruAbilities,
} from './cuteGreenYellowSweep'
import {
  mutagenTokenAbilities,
  treasureTokenAbilities,
} from './treasureMutagenTokens'
import {
  flamingFistAbilities,
  swordCoastSailorAbilities,
} from './grantedTriggeredAbilities'
import {
  laviniaAzoriusRenegadeAbilities,
  momoFriendlyFlierAbilities,
  narsetParterOfVeilsAbilities,
} from './cuteRestrictionsPermissions'
import {
  crashingWaveAbilities,
  marchOfOtherworldlyLightAbilities,
  marchOfSwirlingMistAbilities,
  resourcefulDefenseAbilities,
  thaliaHereticCatharAbilities,
  windbornMuseAbilities,
} from './cuteSpecialMechanics'
import {
  bendersWaterskinAbilities,
  eightAndAHalfTailsAbilities,
  emptyCityRuseAbilities,
  fabledPassageAbilities,
  heroesPodiumAbilities,
  ledgerShredderAbilities,
  pathToRedemptionAbilities,
  pheliaExuberantShepherdAbilities,
  secretTunnelAbilities,
  syggWanderbrineShieldAbilities,
  syggWanderwineWisdomAbilities,
  wateryGraspAbilities,
} from './cuteFinalSweep'
import type { AbilityDefinition } from '../types/abilityTypes'
import { compileCardAbilities } from '../compiler/compileCardAbilities'
import type {
  CapabilityGap,
  CompilationStatus,
} from '../compiler/types/compilerTypes'
import { getReadyRuntimeDefinitions } from '../generated/runtimeCatalogLoader'

const definitionsByCardName: Record<string, AbilityDefinition[]> = {
  "Bender's Waterskin": bendersWaterskinAbilities,
  'Eight-and-a-Half-Tails': eightAndAHalfTailsAbilities,
  'Empty City Ruse': emptyCityRuseAbilities,
  'Fabled Passage': fabledPassageAbilities,
  "Heroes' Podium": heroesPodiumAbilities,
  'Ledger Shredder': ledgerShredderAbilities,
  'Path to Redemption': pathToRedemptionAbilities,
  'Phelia, Exuberant Shepherd': pheliaExuberantShepherdAbilities,
  'Secret Tunnel': secretTunnelAbilities,
  'Sygg, Wanderwine Wisdom': syggWanderwineWisdomAbilities,
  'Sygg, Wanderbrine Shield': syggWanderbrineShieldAbilities,
  'Watery Grasp': wateryGraspAbilities,
  'Ishai, Ojutai Dragonspeaker': ishaiAbilities,
  'Aerith Gainsborough': aerithAbilities,
  'Yoshimaru, Ever Faithful': yoshimaruAbilities,
  'Abandoned Air Temple': abandonedAirTempleAbilities,
  "Agna Qel'a": agnaQelaAbilities,
  "An Offer You Can't Refuse": anOfferYouCantRefuseAbilities,
  'Animal Sanctuary': animalSanctuaryAbilities,
  'Arcane Signet': arcaneSignetAbilities,
  'Blackblade Reforged': blackbladeReforgedAbilities,
  'Brotherhood Regalia': brotherhoodRegaliaAbilities,
  'Command Tower': commandTowerAbilities,
  'Day of Destiny': dayOfDestinyAbilities,
  Desynchronization: desynchronizationAbilities,
  "Dovin's Veto": dovinsVetoAbilities,
  'Enter the Avatar State': enterTheAvatarStateAbilities,
  'Esior, Wardwing Familiar': esiorAbilities,
  'Flowering of the White Tree': floweringWhiteTreeAbilities,
  'Glacial Fortress': glacialFortressAbilities,
  'Grand Arbiter Augustin IV': grandArbiterAbilities,
  'Hammer of Nazahn': hammerOfNazahnAbilities,
  'Herald of Secret Streams': heraldSecretStreamsAbilities,
  'K-9, Mark I': k9Abilities,
  'Kwain, Itinerant Meddler': kwainAbilities,
  'Minas Tirith': minasTirithAbilities,
  'Mithril Coat': mithrilCoatAbilities,
  'Momo, Playful Pet': momoPlayfulPetAbilities,
  'Prairie Stream': prairieStreamAbilities,
  'Repel Calamity': repelCalamityAbilities,
  'Rosa, Resolute White Mage': rosaAbilities,
  'Swiftfoot Boots': swiftfootBootsAbilities,
  "Teshar, Ancestor's Apostle": tesharAbilities,
  'The Ooze': theOozeAbilities,
  'Trenzalore Clocktower': trenzaloreAbilities,
  'Ty Lee, Chi Blocker': tyLeeAbilities,
  'Unbreakable Formation': unbreakableFormationAbilities,
  'Urdnan, Dromoka Warrior': urdnanAbilities,
  'Venat, Heart of Hydaelyn': venatAbilities,
  'Flaming Fist': flamingFistAbilities,
  'Sword Coast Sailor': swordCoastSailorAbilities,
  'Lavinia, Azorius Renegade': laviniaAzoriusRenegadeAbilities,
  'Narset, Parter of Veils': narsetParterOfVeilsAbilities,
  'Momo, Friendly Flier': momoFriendlyFlierAbilities,
  'Crashing Wave': crashingWaveAbilities,
  'March of Otherworldly Light': marchOfOtherworldlyLightAbilities,
  'March of Swirling Mist': marchOfSwirlingMistAbilities,
  'Resourceful Defense': resourcefulDefenseAbilities,
  'Windborn Muse': windbornMuseAbilities,
  'Thalia, Heretic Cathar': thaliaHereticCatharAbilities,
  'Treasure Token': treasureTokenAbilities,
  'Mutagen Token': mutagenTokenAbilities,
  'Namor the Sub-Mariner': namorAbilities,
  'Kopala, Warden of Waves': kopalaAbilities,
  'Moonlit Meditation': moonlitMeditationAbilities,
  'Secret Invasion': secretInvasionAbilities,
  'Storm of Saruman': stormOfSarumanAbilities,
  'The Key to the Vault': theKeyToTheVaultAbilities,
  'Sorcerous Squall': sorcerousSquallAbilities,
  Bribery: briberyAbilities,
  'Mist Dancer': mistDancerAbilities,
  'Aqueous Form': aqueousFormAbilities,
  'Curious Farm Animals': curiousFarmAnimalsAbilities,
  Rivendell: rivendellAbilities,
  'Senu, Keen-Eyed Protector': senuAbilities,
  'The Grey Havens': theGreyHavensAbilities,
  'Crumb and Get It': crumbAndGetItAbilities,
  "Dawn's Truce": dawnsTruceAbilities,
  'Into the Flood Maw': intoTheFloodMawAbilities,
  Kitnap: kitnapAbilities,
  "Long River's Pull": longRiversPullAbilities,
  'Food Token': foodTokenAbilities,
  'Honest Work': honestWorkAbilities,
  "Katara, Water Tribe's Hope": kataraWaterTribesHopeAbilities,
  "Luxior, Giada's Gift": luxiorGiadasGiftAbilities,
  'Thassa, God of the Sea': thassaGodOfTheSeaAbilities,
  'Wrecking Ball Arm': wreckingBallArmAbilities,
  'Eiganjo Castle': eiganjoCastleAbilities,
  'Caduceus, Staff of Hermes': caduceusStaffOfHermesAbilities,
  'Pippin, Guard of the Citadel': pippinGuardOfTheCitadelAbilities,
  'Everybody Lives!': everybodyLivesAbilities,
  "Teferi's Protection": teferisProtectionAbilities,
  'Aang, Swift Savior': aangSwiftSaviorAbilities,
  "Aang and La, Ocean's Fury": aangAndLaOceansFuryAbilities,
  'Aang, the Last Airbender': aangTheLastAirbenderAbilities,
  'Eiganjo, Seat of the Empire': eiganjoSeatOfTheEmpireAbilities,
  'Lilypad Village': lilypadVillageAbilities,
  'Lupinflower Village': lupinflowerVillageAbilities,
}

export type RuntimeSupportStatus =
  'READY' | 'NO_RUNTIME_ABILITY' | 'PARTIAL' | 'MANUAL' | 'UNSUPPORTED'

export type CardRuntimeSupport = {
  status: RuntimeSupportStatus
  source: 'EXPLICIT' | 'PRECOMPILED' | 'DETERMINISTIC'
  abilities: AbilityDefinition[]
  executable: boolean
  compilerStatus?: CompilationStatus
  unsupportedFragments?: string[]
  warnings?: string[]
  capabilityGaps?: CapabilityGap[]
}

const runtimeStatusFromCompiler = (
  status: CompilationStatus,
): RuntimeSupportStatus => {
  switch (status) {
    case 'COMPILED':
      return 'READY'
    case 'NO_RUNTIME_ABILITY':
      return 'NO_RUNTIME_ABILITY'
    case 'PARTIAL':
      return 'PARTIAL'
    case 'MANUAL':
      return 'MANUAL'
    case 'FAILED':
      return 'UNSUPPORTED'
  }
}

/**
 * Runtime support is strict: PARTIAL is diagnostic-only and never executable.
 * A card must be fully READY/COMPILED, explicitly defined, or require no runtime
 * ability before the game engine may automate it.
 */
export const getCardRuntimeSupport = (
  card: CardDefinition,
): CardRuntimeSupport => {
  const explicit = definitionsByCardName[card.name]
  if (explicit)
    return {
      status: 'READY',
      source: 'EXPLICIT',
      abilities: explicit,
      executable: true,
    }

  const precompiled = getReadyRuntimeDefinitions(card.name)
  if (precompiled)
    return {
      status: 'READY',
      source: 'PRECOMPILED',
      abilities: precompiled,
      executable: true,
    }

  const compiled = compileCardAbilities(card)
  const status = runtimeStatusFromCompiler(compiled.status)
  return {
    status,
    source: 'DETERMINISTIC',
    abilities: compiled.status === 'COMPILED' ? compiled.abilities : [],
    executable:
      compiled.status === 'COMPILED' ||
      compiled.status === 'NO_RUNTIME_ABILITY',
    compilerStatus: compiled.status,
    unsupportedFragments: compiled.unsupportedFragments,
    warnings: compiled.warnings,
    capabilityGaps: compiled.capabilityGaps,
  }
}

export const getAbilitiesForCard = (
  card: CardDefinition,
): AbilityDefinition[] => getCardRuntimeSupport(card).abilities
