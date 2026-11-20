import React from 'react';

import { UserAndContext } from '@/auth/types';
import MarkdownDisplay from '@/components/chat/markdown-display';
import { missingTrainingDisclaimers } from '@/components/modals/const';

import { FederalStateId, getFederalStateNameById } from './const';

type AccessResult =
  | {
      hasAccess: false;
      errorMessage: React.ReactNode;
      errorType: 'RESTRICTED_ROLE' | 'TRAINING_NEEDED';
    }
  | {
      hasAccess: true;
    };
/**
 * Checks if a user has access to the AIS.chat product based on their role, training requirements,
 * and federal state configuration.
 */
export function checkProductAccess({
  federalState,
  userRole,
  hasCompletedTraining = true,
}: UserAndContext & { hasCompletedTraining?: boolean }): AccessResult {
  const successResult: AccessResult = { hasAccess: true };

  if (userRole === 'student' && !federalState.featureToggles.isStudentAccessEnabled) {
    return {
      hasAccess: false,
      errorMessage: (
        <p>
          Tut uns leid, du kannst AIS.chat als Schüler oder Schülerin noch nicht außerhalb des
          Unterrichts nutzen. Bitte wende dich an deine Lehrkraft, wenn du den KI-Chat gerne
          gemeinsam mit der Klasse verwenden möchtest.
        </p>
      ),
      errorType: 'RESTRICTED_ROLE',
    };
  }

  const trainingRequired = federalState.mandatoryCertificationTeacher === true;

  if (trainingRequired && !hasCompletedTraining) {
    const disclaimer = missingTrainingDisclaimers[federalState.id as FederalStateId];
    if (disclaimer) {
      return {
        hasAccess: false,
        errorMessage: <MarkdownDisplay>{disclaimer}</MarkdownDisplay>,
        errorType: 'TRAINING_NEEDED',
      };
    }
    return {
      hasAccess: false,
      errorMessage: (
        <div className="flex flex-col gap-2">
          <p>{`Tut uns leid, du kannst AIS.chat noch nicht nutzen, da du die in ${getFederalStateNameById(federalState.id)} dafür vorgeschriebene Schulung noch nicht besucht hast.`}</p>
          {federalState.trainingLink && (
            <p>
              Weitere Informationen, bzw. die Möglichkeit die Schulung jetzt zu absolvieren, findest
              du hier{' '}
              <a
                href={federalState.trainingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {federalState.trainingLink}
              </a>
            </p>
          )}
          <p>Du hast die Schulung bereits absolviert? Dann logge dich einmal aus und wieder ein.</p>
        </div>
      ),
      errorType: 'TRAINING_NEEDED',
    };
  }

  return successResult;
}
